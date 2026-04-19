import Scoreboard from "./leaderboard";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  return <Scoreboard role={session?.role ?? null} />;
}
