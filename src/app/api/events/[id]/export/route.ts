import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { getPersonalRankLimit } from "@/lib/queries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }

  const sql = getSql();
  const evRows = (await sql`
    select name from events where id = ${id} limit 1
  `) as Array<{ name: string }>;
  if (evRows.length === 0) {
    return NextResponse.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });
  }
  const eventName = evRows[0].name;

  const classRows = (await sql`
    with class_totals as (
      select s.grade, s.class_no,
        coalesce(sum(sc.points), 0)::int as total,
        max(sc.updated_at) as last_scored
      from students s
      left join scores sc on sc.sid = s.sid and sc.event_id = ${id}
      group by s.grade, s.class_no
      having coalesce(sum(sc.points), 0) > 0
    )
    select grade, class_no as "classNo", total as "totalPoints",
      (dense_rank() over (order by total desc))::int as rank
    from class_totals
    order by total desc, last_scored desc nulls last, grade asc, class_no asc
  `) as Array<{ grade: number; classNo: number; totalPoints: number; rank: number }>;

  const limit = await getPersonalRankLimit();
  const personalRows = (await sql`
    with totals as (
      select sc.sid, sum(sc.points)::int as total,
        max(sc.updated_at) as last_scored
      from scores sc
      where sc.event_id = ${id}
      group by sc.sid
    )
    select t.sid, st.grade, st.class_no as "classNo", st.student_no as "studentNo",
      t.total as "totalPoints",
      (dense_rank() over (order by t.total desc))::int as rank
    from totals t
    join students st on st.sid = t.sid
    order by t.total desc, t.last_scored desc nulls last, t.sid asc
    limit ${limit}
  `) as Array<{
    sid: string;
    grade: number;
    classNo: number;
    studentNo: number;
    totalPoints: number;
    rank: number;
  }>;

  const lines: string[] = [];
  lines.push(`[행사] ${eventName}`);
  lines.push("");
  lines.push("[반 순위]");
  lines.push(["순위", "학년", "반", "총점"].join(","));
  classRows.forEach((r) => {
    lines.push(
      [r.rank, r.grade, r.classNo, r.totalPoints].map(csvField).join(","),
    );
  });
  lines.push("");
  lines.push(`[개인 순위 (상위 ${limit}명)]`);
  lines.push(["순위", "개인식별번호", "학년", "반", "번호", "총점"].join(","));
  personalRows.forEach((r) => {
    lines.push(
      [r.rank, r.sid, r.grade, r.classNo, r.studentNo, r.totalPoints]
        .map(csvField)
        .join(","),
    );
  });

  // BOM for Excel Korean support
  const body = "\ufeff" + lines.join("\r\n") + "\r\n";

  const safeName = eventName.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "event";
  const filename = `${safeName}_rankings.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
