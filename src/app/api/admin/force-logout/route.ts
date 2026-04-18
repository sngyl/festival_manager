import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { gameName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const gameName = (body.gameName ?? "").trim();
  if (!gameName) return NextResponse.json({ error: "gameName 필요" }, { status: 400 });

  const sql = getSql();
  const result = (await sql`
    delete from teacher_sessions where game_name = ${gameName}
    returning game_name
  `) as Array<{ game_name: string }>;
  return NextResponse.json({ ok: true, cleared: result.length });
}
