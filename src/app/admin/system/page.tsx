import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SystemMaintenancePanel } from "./SystemMaintenancePanel";

export default async function SystemMaintenancePage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") {
    redirect("/403");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">系统维护</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理缓存刷新和应用重启。</p>
      </div>
      <SystemMaintenancePanel />
    </div>
  );
}
