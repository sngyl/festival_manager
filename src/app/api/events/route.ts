import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const sql = getSql();
  const rows = (await sql`
    select e.id, e.name, e.active, e.created_at,
      (select count(*)::int from games g where g.event_id = e.id) as game_count,
      (select count(*)::int from scores s where s.event_id = e.id) as score_count
    from events e
    order by e.active desc, e.created_at desc
  `) as Array<{
    id: string;
    name: string;
    active: boolean;
    created_at: string;
    game_count: number;
    score_count: number;
  }>;
  return NextResponse.json({ events: rows });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { name?: string; activate?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "행사 이름이 필요합니다." }, { status: 400 });
  if (name.length > 100)
    return NextResponse.json({ error: "행사 이름이 너무 깁니다 (최대 100자)." }, { status: 400 });

  const sql = getSql();
  try {
    const inserted = await sql.begin(async (tx) => {
      if (body.activate) {
        await tx`update events set active = false where active = true`;
      }
      const rows = (await tx`
        insert into events (name, active)
        values (${name}, ${body.activate ? true : false})
        returning id, name, active, created_at
      `) as Array<{ id: string; name: string; active: boolean; created_at: string }>;
      return rows[0];
    });
    return NextResponse.json({ event: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `생성 실패: ${message}` }, { status: 500 });
  }
}
