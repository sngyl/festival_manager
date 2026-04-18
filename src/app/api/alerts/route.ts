import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const sql = getSql();
  const rows = (await sql`
    select id, game_name, attempted_at
    from login_alerts
    where resolved = false
    order by attempted_at desc
    limit 50
  `) as Array<{ id: string; game_name: string; attempted_at: string }>;
  return NextResponse.json({ alerts: rows });
}
