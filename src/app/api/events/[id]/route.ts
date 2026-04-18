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

  let body: { active?: boolean; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const sql = getSql();

  if (typeof body.active === "boolean") {
    if (body.active) {
      await sql.begin(async (tx) => {
        await tx`update events set active = false where active = true`;
        await tx`update events set active = true where id = ${id}`;
      });
    } else {
      await sql`update events set active = false where id = ${id}`;
    }
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "행사 이름이 필요합니다." }, { status: 400 });
    await sql`update events set name = ${name} where id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

  let body: { confirmName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const sql = getSql();
  const rows = (await sql`select name from events where id = ${id} limit 1`) as Array<{
    name: string;
  }>;
  if (rows.length === 0)
    return NextResponse.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });
  if ((body.confirmName ?? "").trim() !== rows[0].name) {
    return NextResponse.json(
      { error: "행사 이름을 정확히 입력해야 삭제됩니다." },
      { status: 400 },
    );
  }

  await sql`delete from events where id = ${id}`;
  return NextResponse.json({ ok: true });
}
