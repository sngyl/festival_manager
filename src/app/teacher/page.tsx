import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isTeacherSessionActive } from "@/lib/auth";
import { getSql } from "@/lib/db";
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

  const sql = getSql();
  const kindRows = (await sql`
    select g.kind from games g
    join events e on e.id = g.event_id
    where e.active = true and g.name = ${session.gameName}
    limit 1
  `) as Array<{ kind: "individual" | "team" }>;
  const kind = kindRows[0]?.kind ?? "individual";

  return <TeacherScoreForm gameName={session.gameName} kind={kind} />;
}
