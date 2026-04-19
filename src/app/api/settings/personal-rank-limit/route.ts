import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { getPersonalRankLimit } from "@/lib/queries";

const KEY = "personal_rank_limit";
const MAX = 1000;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const value = await getPersonalRankLimit();
  return NextResponse.json({ value });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { value?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const n =
    typeof body.value === "number"
      ? body.value
      : typeof body.value === "string" && /^\d+$/.test(body.value)
        ? parseInt(body.value, 10)
        : NaN;

  if (!Number.isInteger(n) || n < 1 || n > MAX) {
    return NextResponse.json(
      { error: `1 이상 ${MAX} 이하의 정수만 허용됩니다.` },
      { status: 400 },
    );
  }

  const sql = getSql();
  await sql`
    insert into settings (key, value) values (${KEY}, ${String(n)})
    on conflict (key) do update set value = excluded.value
  `;
  return NextResponse.json({ ok: true, value: n });
}
