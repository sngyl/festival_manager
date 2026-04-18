import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

const SID_RE = /^[1-9]\d{4}$/;

type Ctx = { params: Promise<{ sid: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { sid } = await ctx.params;
  if (!SID_RE.test(sid)) {
    return NextResponse.json({ error: "잘못된 개인식별번호" }, { status: 400 });
  }

  const sql = getSql();
  const rows = (await sql`
    delete from students where sid = ${sid} returning sid
  `) as Array<{ sid: string }>;

  if (rows.length === 0) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
