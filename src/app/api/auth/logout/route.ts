import { NextResponse } from "next/server";
import { releaseTeacherSession } from "@/lib/auth";
import { clearSessionCookie, getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (session?.role === "teacher") {
    await releaseTeacherSession(session.gameName, session.token);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
