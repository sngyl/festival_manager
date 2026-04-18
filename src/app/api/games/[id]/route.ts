import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "게임 이름이 필요합니다." }, { status: 400 });

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      const rows = (await tx`select name from games where id = ${id} limit 1`) as Array<{
        name: string;
      }>;
      if (rows.length === 0) throw new Error("not_found");
      const oldName = rows[0].name;
      await tx`update games set name = ${name} where id = ${id}`;
      if (oldName !== name) {
        await tx`update teacher_sessions set game_name = ${name} where game_name = ${oldName}`;
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "not_found")
      return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });
    if (message.includes("unique") || message.includes("games_event_id_name_key")) {
      return NextResponse.json({ error: "같은 이름의 게임이 이미 있습니다." }, { status: 409 });
    }
    return NextResponse.json({ error: `수정 실패: ${message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  const sql = getSql();
  const rows = (await sql`select name from games where id = ${id} limit 1`) as Array<{
    name: string;
  }>;
  if (rows.length === 0)
    return NextResponse.json({ error: "게임을 찾을 수 없습니다." }, { status: 404 });

  await sql.begin(async (tx) => {
    await tx`delete from teacher_sessions where game_name = ${rows[0].name}`;
    await tx`delete from games where id = ${id}`;
  });
  return NextResponse.json({ ok: true });
}
