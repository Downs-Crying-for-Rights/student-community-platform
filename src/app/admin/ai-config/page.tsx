import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AiConfigPanel } from "./AiConfigPanel";

export default async function AiConfigPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") redirect("/403");
  return <AiConfigPanel />;
}
