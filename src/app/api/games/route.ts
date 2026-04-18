import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

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
    select g.id, g.name, g.created_at,
      (select count(*)::int from scores s where s.game_id = g.id) as score_count,
      (select session_token is not null from teacher_sessions ts where ts.game_name = g.name) as active_session
    from games g
    where g.event_id = ${eventId}
    order by g.created_at asc
  `) as Array<{
    id: string;
    name: string;
    created_at: string;
    score_count: number;
    active_session: boolean | null;
  }>;

  return NextResponse.json({
    games: rows.map((r) => ({ ...r, active_session: r.active_session ?? false })),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { event_id?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const eventId = (body.event_id ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!UUID_RE.test(eventId))
    return NextResponse.json({ error: "event_id 필요" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "게임 이름이 필요합니다." }, { status: 400 });
  if (name.length > 50)
    return NextResponse.json({ error: "게임 이름이 너무 깁니다 (최대 50자)." }, { status: 400 });

  const sql = getSql();
  try {
    const rows = (await sql`
      insert into games (event_id, name) values (${eventId}, ${name})
      returning id, name, created_at
    `) as Array<{ id: string; name: string; created_at: string }>;
    return NextResponse.json({ game: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message.includes("games_event_id_name_key") || message.includes("unique")) {
      return NextResponse.json({ error: "같은 이름의 게임이 이미 있습니다." }, { status: 409 });
    }
    return NextResponse.json({ error: `생성 실패: ${message}` }, { status: 500 });
  }
}
