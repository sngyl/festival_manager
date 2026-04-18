import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./db";

// --- Admin password: YYMMDD in Asia/Seoul, never stored. -----------------

export function adminPasswordToday(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}${m}${d}`;
}

export function verifyAdminPassword(input: string): boolean {
  if (!/^\d{6}$/.test(input)) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(adminPasswordToday());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Teacher password: bcrypt hash in settings.teacher_password_hash -----

const HASH_KEY = "teacher_password_hash";

export async function getTeacherPasswordHash(): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`
    select value from settings where key = ${HASH_KEY} limit 1
  `) as Array<{ value: string }>;
  return rows[0]?.value ?? null;
}

export async function setTeacherPassword(plain: string): Promise<void> {
  if (!/^\d{6}$/.test(plain)) throw new Error("teacher_password_must_be_6_digits");
  const hash = await bcrypt.hash(plain, 10);
  const sql = getSql();
  await sql`
    insert into settings (key, value) values (${HASH_KEY}, ${hash})
    on conflict (key) do update set value = excluded.value
  `;
}

export async function verifyTeacherPassword(input: string): Promise<boolean> {
  if (!/^\d{6}$/.test(input)) return false;
  const hash = await getTeacherPasswordHash();
  if (!hash) return false;
  return bcrypt.compare(input, hash);
}

// --- Teacher single-session claim -----------------------------------------

export type ClaimResult =
  | { ok: true; token: string }
  | { ok: false; reason: "game_not_found" | "already_active" };

export async function claimTeacherSession(
  gameName: string,
  deviceHint: string,
): Promise<ClaimResult> {
  const sql = getSql();

  const gameRows = (await sql`
    select g.id from games g
    join events e on e.id = g.event_id and e.active = true
    where g.name = ${gameName}
    limit 1
  `) as Array<{ id: string }>;
  if (gameRows.length === 0) return { ok: false, reason: "game_not_found" };

  const token = crypto.randomBytes(32).toString("hex");
  const inserted = (await sql`
    insert into teacher_sessions (game_name, session_token, device_hint)
    values (${gameName}, ${token}, ${deviceHint})
    on conflict (game_name) do nothing
    returning session_token
  `) as Array<{ session_token: string }>;

  if (inserted.length === 0) {
    await sql`insert into login_alerts (game_name) values (${gameName})`;
    return { ok: false, reason: "already_active" };
  }
  return { ok: true, token };
}

export async function releaseTeacherSession(gameName: string, token: string): Promise<void> {
  const sql = getSql();
  await sql`
    delete from teacher_sessions
    where game_name = ${gameName} and session_token = ${token}
  `;
}

const TEACHER_SESSION_IDLE_MS = 30 * 60 * 1000;

export async function isTeacherSessionActive(gameName: string, token: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    select last_seen_at from teacher_sessions
    where game_name = ${gameName} and session_token = ${token}
    limit 1
  `) as Array<{ last_seen_at: string | Date }>;
  if (rows.length === 0) return false;
  const lastSeen = new Date(rows[0].last_seen_at).getTime();
  if (Date.now() - lastSeen > TEACHER_SESSION_IDLE_MS) {
    await sql`
      delete from teacher_sessions
      where game_name = ${gameName} and session_token = ${token}
    `;
    return false;
  }
  await sql`
    update teacher_sessions set last_seen_at = now()
    where game_name = ${gameName} and session_token = ${token}
  `;
  return true;
}

// --- Device hint (for session telemetry, not security) -------------------

export function deviceHint(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  return crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);
}

// --- Simple in-memory rate limit (per-instance; for prod use Redis) ------

type Bucket = { count: number; resetAt: number };
const BUCKETS = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
