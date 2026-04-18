import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID_RE = /^[1-9]\d{4}$/;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const scoreId = url.searchParams.get("score_id");
  const eventId = url.searchParams.get("event_id");
  const gameId = url.searchParams.get("game_id");
  const sid = url.searchParams.get("sid");

  const sql = getSql();

  if (scoreId) {
    if (!UUID_RE.test(scoreId))
      return NextResponse.json({ error: "잘못된 score_id" }, { status: 400 });
    const logs = (await sql`
      select id, old_points, new_points, changed_by, changed_at
      from score_logs
      where score_id = ${scoreId}
      order by changed_at desc
    `) as Array<{
      id: string;
      old_points: number | null;
      new_points: number;
      changed_by: string;
      changed_at: string;
    }>;
    return NextResponse.json({ logs });
  }

  if (eventId && gameId && sid) {
    if (!UUID_RE.test(eventId) || !UUID_RE.test(gameId) || !SID_RE.test(sid))
      return NextResponse.json({ error: "파라미터 형식 오류" }, { status: 400 });
    const logs = (await sql`
      select id, old_points, new_points, changed_by, changed_at
      from score_logs
      where event_id = ${eventId} and game_id = ${gameId} and sid = ${sid}
      order by changed_at desc
    `) as Array<{
      id: string;
      old_points: number | null;
      new_points: number;
      changed_by: string;
      changed_at: string;
    }>;
    return NextResponse.json({ logs });
  }

  return NextResponse.json(
    { error: "score_id 또는 (event_id, game_id, sid)가 필요합니다." },
    { status: 400 },
  );
}
