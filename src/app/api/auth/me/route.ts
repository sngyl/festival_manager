import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ role: null });
  if (session.role === "admin") return NextResponse.json({ role: "admin" });
  return NextResponse.json({ role: "teacher", gameName: session.gameName });
}
