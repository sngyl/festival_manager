import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminLanding from "./landing";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/login");
  }
  return <AdminLanding />;
}
