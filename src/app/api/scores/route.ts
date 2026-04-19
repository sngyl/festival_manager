import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isTeacherSessionActive, rateLimit } from "@/lib/auth";
import { getActiveEvent } from "@/lib/queries";
import { requireAdmin } from "@/lib/admin-guard";

const SID_RE = /^[1-9]\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const eventId = url.searchParams.get("event_id") ?? "";
  if (!UUID_RE.test(eventId))
    return NextResponse.json({ error: "event_id 필요" }, { status: 400 });

  const sql = getSql();
  const rows = (await sql`
    select sc.id, sc.sid, sc.game_id, g.name as game_name, sc.points,
      sc.created_by, sc.updated_at,
      st.grade, st.class_no, st.student_no
    from scores sc
    join games g on g.id = sc.game_id
    join students st on st.sid = sc.sid
    where sc.event_id = ${eventId}
    order by st.grade asc, st.class_no asc, st.student_no asc, g.name asc
  `) as Array<{
    id: string;
    sid: string;
    game_id: string;
    game_name: string;
    points: number;
    created_by: string;
    updated_at: string;
    grade: number;
    class_no: number;
    student_no: number;
  }>;

  return NextResponse.json({ scores: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`scores:${ip}`, 60, 60_000)) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  }

  let body: { sid?: string; points?: unknown; gameName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const sid = (body.sid ?? "").trim();
  const pointsNum =
    typeof body.points === "number"
      ? body.points
      : typeof body.points === "string" && /^-?\d+$/.test(body.points)
        ? parseInt(body.points, 10)
        : NaN;

  if (!SID_RE.test(sid)) {
    return NextResponse.json({ error: "개인식별번호 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const grade = parseInt(sid[0], 10);
  const classNo = parseInt(sid.slice(1, 3), 10);
  const studentNo = parseInt(sid.slice(3, 5), 10);
  if (classNo < 1 || studentNo < 1) {
    return NextResponse.json(
      { error: "반/번호는 01~99 범위여야 합니다." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(pointsNum)) {
    return NextResponse.json({ error: "점수는 정수여야 합니다." }, { status: 400 });
  }

  let gameName: string;
  let changedBy: string;
  if (session.role === "teacher") {
    if (!(await isTeacherSessionActive(session.gameName, session.token))) {
      return NextResponse.json({ error: "세션이 만료되었습니다. 다시 로그인하세요." }, { status: 401 });
    }
    gameName = session.gameName;
    changedBy = `teacher:${session.gameName}`;
  } else {
    gameName = (body.gameName ?? "").trim();
    if (!gameName) return NextResponse.json({ error: "gameName 필요" }, { status: 400 });
    changedBy = "admin";
  }

  const event = await getActiveEvent();
  if (!event) {
    return NextResponse.json({ error: "활성 행사가 없습니다." }, { status: 409 });
  }

  const sql = getSql();

  const gameRows = (await sql`
    select id from games where event_id = ${event.id} and name = ${gameName} limit 1
  `) as Array<{ id: string }>;
  if (gameRows.length === 0) {
    return NextResponse.json({ error: "해당 게임을 찾을 수 없습니다." }, { status: 404 });
  }
  const gameId = gameRows[0].id;

  await sql`
    insert into students (sid, grade, class_no, student_no)
    values (${sid}, ${grade}, ${classNo}, ${studentNo})
    on conflict (sid) do nothing
  `;

  try {
    await sql.begin(async (tx) => {
      const existing = (await tx`
        select id, points from scores
        where event_id = ${event.id} and game_id = ${gameId} and sid = ${sid}
        limit 1
      `) as Array<{ id: string; points: number }>;

      if (existing.length === 0) {
        const inserted = (await tx`
          insert into scores (event_id, game_id, sid, points, created_by)
          values (${event.id}, ${gameId}, ${sid}, ${pointsNum}, ${changedBy})
          returning id
        `) as Array<{ id: string }>;
        await tx`
          insert into score_logs (score_id, event_id, game_id, sid, old_points, new_points, changed_by)
          values (${inserted[0].id}, ${event.id}, ${gameId}, ${sid}, null, ${pointsNum}, ${changedBy})
        `;
      } else if (existing[0].points !== pointsNum) {
        await tx`
          update scores
          set points = ${pointsNum}, updated_at = now(), created_by = ${changedBy}
          where id = ${existing[0].id}
        `;
        await tx`
          insert into score_logs (score_id, event_id, game_id, sid, old_points, new_points, changed_by)
          values (${existing[0].id}, ${event.id}, ${gameId}, ${sid}, ${existing[0].points}, ${pointsNum}, ${changedBy})
        `;
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `저장 실패: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sid, points: pointsNum, gameName });
}
