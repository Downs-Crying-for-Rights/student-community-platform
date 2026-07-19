import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { QQBotMonitor } from "./QQBotMonitor";

export default async function QQBotAdminPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/403");
  return <QQBotMonitor />;
}
