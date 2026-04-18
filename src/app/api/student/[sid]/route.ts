import { NextResponse } from "next/server";
import { getStudentDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SID_RE = /^[1-9]\d{4}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sid: string }> }
) {
  const { sid } = await params;
  if (!SID_RE.test(sid)) {
    return NextResponse.json(
      { error: "개인식별번호는 5자리 숫자여야 합니다 (학년+반+번호)." },
      { status: 400 }
    );
  }
  try {
    const data = await getStudentDetail(sid);
    if (!data) {
      return NextResponse.json(
        { error: "해당 개인식별번호를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
