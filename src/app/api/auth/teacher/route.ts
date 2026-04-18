import { NextResponse } from "next/server";
import {
  claimTeacherSession,
  deviceHint,
  rateLimit,
  verifyTeacherPassword,
} from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  let body: { gameName?: string; password?: string };
  try {
    body = (await req.json()) as { gameName?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const gameName = (body.gameName ?? "").trim();
  const password = body.password ?? "";

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`teacher:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  if (!gameName) {
    return NextResponse.json({ error: "게임 이름을 입력하세요." }, { status: 400 });
  }
  if (!(await verifyTeacherPassword(password))) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
  }

  const claim = await claimTeacherSession(gameName, deviceHint(req));
  if (!claim.ok) {
    if (claim.reason === "game_not_found") {
      return NextResponse.json({ error: "해당 게임을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "다른 기기에서 이미 이 게임으로 로그인 중입니다. 관리자에게 문의하세요." },
      { status: 409 },
    );
  }

  const res = NextResponse.json({ ok: true, role: "teacher", gameName });
  setSessionCookie(res, { role: "teacher", gameName, token: claim.token });
  return res;
}
