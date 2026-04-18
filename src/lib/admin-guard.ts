import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "./session";

export async function requireAdmin(): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 401 }),
    };
  }
  return { ok: true };
}
