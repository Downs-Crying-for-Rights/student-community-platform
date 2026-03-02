import React from "react";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { hasMinimumRole } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { AdminNav } from "@/components/layout/AdminNav";
import { AdminLayoutClient } from "@/components/layout/AdminLayoutClient";
import type { Role } from "@prisma/client";

/**
 * Admin layout — server component that enforces MODERATOR+ access.
 *
 * - Unauthenticated users → redirect to /login
 * - Users below MODERATOR role → log AuditLog (UNAUTHORIZED_ACCESS) and redirect to /403
 * - MODERATOR / ADMIN / SUPER_ADMIN → render children with Sidebar + AdminNav
 *
 * Validates: Requirements 17.5
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user.role ?? "USER") as Role;

  if (!hasMinimumRole(role, "MODERATOR")) {
    await logAudit(
      session.user.id,
      AuditAction.UNAUTHORIZED_ACCESS,
      AuditTargetType.USER,
      session.user.id,
      { attemptedRoute: "/admin", role },
    );
    redirect("/403");
  }

  return (
    <AdminLayoutClient>
      <AdminNav />
      {children}
    </AdminLayoutClient>
  );
}
