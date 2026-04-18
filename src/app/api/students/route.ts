import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";

const SID_RE = /^[1-9]\d{4}$/;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sql = getSql();
  const rows = (await sql`
    select s.sid, s.grade, s.class_no, s.student_no,
      (exists (select 1 from scores sc where sc.sid = s.sid)) as has_scores
    from students s
    order by s.grade asc, s.class_no asc, s.student_no asc
  `) as Array<{
    sid: string;
    grade: number;
    class_no: number;
    student_no: number;
    has_scores: boolean;
  }>;

  return NextResponse.json({ students: rows });
}

type BulkResult = {
  inserted: string[];
  skipped: string[];
  invalid: string[];
};

function parseSid(raw: string): { sid: string; grade: number; class_no: number; student_no: number } | null {
  const sid = raw.trim();
  if (!SID_RE.test(sid)) return null;
  const class_no = parseInt(sid.slice(1, 3), 10);
  const student_no = parseInt(sid.slice(3, 5), 10);
  if (class_no < 1 || student_no < 1) return null;
  return {
    sid,
    grade: parseInt(sid[0], 10),
    class_no,
    student_no,
  };
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { sid?: string; sids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const rawList: string[] = Array.isArray(body.sids)
    ? (body.sids as unknown[]).filter((x): x is string => typeof x === "string")
    : typeof body.sid === "string"
      ? [body.sid]
      : [];

  if (rawList.length === 0) {
    return NextResponse.json({ error: "sid 또는 sids가 필요합니다." }, { status: 400 });
  }
  if (rawList.length > 5000) {
    return NextResponse.json({ error: "한 번에 최대 5000명까지 등록할 수 있습니다." }, { status: 400 });
  }

  const result: BulkResult = { inserted: [], skipped: [], invalid: [] };
  const validRows: Array<{ sid: string; grade: number; class_no: number; student_no: number }> = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    const parsed = parseSid(raw);
    if (!parsed) {
      result.invalid.push(raw.trim());
      continue;
    }
    if (seen.has(parsed.sid)) continue;
    seen.add(parsed.sid);
    validRows.push(parsed);
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "유효한 개인식별번호가 없습니다.", ...result },
      { status: 400 },
    );
  }

  const sql = getSql();
  try {
    const inserted = (await sql`
      insert into students ${sql(validRows, "sid", "grade", "class_no", "student_no")}
      on conflict (sid) do nothing
      returning sid
    `) as Array<{ sid: string }>;
    const insertedSet = new Set(inserted.map((r) => r.sid));
    for (const r of validRows) {
      if (insertedSet.has(r.sid)) result.inserted.push(r.sid);
      else result.skipped.push(r.sid);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `등록 실패: ${message}` }, { status: 500 });
  }

  return NextResponse.json(result);
}
