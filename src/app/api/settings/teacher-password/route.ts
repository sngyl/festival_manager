import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { setTeacherPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const password = (body.password ?? "").trim();
  if (!/^\d{6}$/.test(password)) {
    return NextResponse.json({ error: "6자리 숫자를 입력하세요." }, { status: 400 });
  }

  try {
    await setTeacherPassword(password);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `저장 실패: ${message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
