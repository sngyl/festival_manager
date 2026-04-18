import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "fm_session";
const DEFAULT_MAX_AGE_SEC = 8 * 60 * 60;

export type AdminSession = { role: "admin"; iat: number; exp: number };
export type TeacherSession = {
  role: "teacher";
  gameName: string;
  token: string;
  iat: number;
  exp: number;
};
export type Session = AdminSession | TeacherSession;

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type SessionPayload = DistributiveOmit<Session, "iat" | "exp">;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (need ≥16 chars).");
  }
  return s;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function encodeSession(payload: SessionPayload & { maxAgeSec?: number }): string {
  const { maxAgeSec = DEFAULT_MAX_AGE_SEC, ...rest } = payload;
  const now = Math.floor(Date.now() / 1000);
  const full = { ...rest, iat: now, exp: now + maxAgeSec } as Session;
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(value: string | undefined | null): Session | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

type CookieOpts = Parameters<NextResponse["cookies"]["set"]>[2];

function cookieOptions(maxAgeSec: number): CookieOpts {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}

export function setSessionCookie(
  res: NextResponse,
  payload: SessionPayload,
  maxAgeSec = DEFAULT_MAX_AGE_SEC,
): void {
  const value = encodeSession({ ...payload, maxAgeSec });
  res.cookies.set(SESSION_COOKIE, value, cookieOptions(maxAgeSec));
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}
