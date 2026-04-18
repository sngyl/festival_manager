import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isTeacherSessionActive } from "@/lib/auth";
import TeacherScoreForm from "./score-form";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const session = await getSession();
  if (!session || session.role !== "teacher") {
    redirect("/login");
  }
  const active = await isTeacherSessionActive(session.gameName, session.token);
  if (!active) {
    redirect("/login?reason=session_expired");
  }

  return <TeacherScoreForm gameName={session.gameName} />;
}
