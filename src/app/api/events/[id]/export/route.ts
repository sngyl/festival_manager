import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

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

  const rows = (await sql`
    select st.sid, st.grade, st.class_no, st.student_no,
      g.name as game_name, sc.points, sc.created_by, sc.updated_at
    from scores sc
    join games g on g.id = sc.game_id
    join students st on st.sid = sc.sid
    where sc.event_id = ${id}
    order by st.grade asc, st.class_no asc, st.student_no asc, g.name asc
  `) as Array<{
    sid: string;
    grade: number;
    class_no: number;
    student_no: number;
    game_name: string;
    points: number;
    created_by: string;
    updated_at: string;
  }>;

  const header = [
    "sid",
    "grade",
    "class_no",
    "student_no",
    "game_name",
    "points",
    "created_by",
    "updated_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sid,
        r.grade,
        r.class_no,
        r.student_no,
        r.game_name,
        r.points,
        r.created_by,
        r.updated_at,
      ]
        .map(csvField)
        .join(","),
    );
  }
  // BOM for Excel Korean support
  const body = "\ufeff" + lines.join("\r\n") + "\r\n";

  const safeName = eventName.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "event";
  const filename = `${safeName}_scores.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
