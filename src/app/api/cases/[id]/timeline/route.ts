import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

/**
 * GET /api/cases/[id]/timeline
 * Get timeline events for a case.
 * - Requires auth
 * - Only submitter, handler, or Admin can view
 * - Logs audit for access
 *
 * Validates: Requirements 11.6, 11.8
 */
export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = await context.params;

    // Check case exists and access
    const caseRecord = await prisma.case.findUnique({
      where: { id },
      select: { submitterId: true, handlerId: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlerId === userId;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    if (!isSubmitter && !isHandler && !isAdmin) {
      return NextResponse.json({ error: "无权访问此委托时间线" }, { status: 403 });
    }

    const timeline = await prisma.timelineEvent.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "asc" },
    });

    // Log audit
    await logAudit(
      userId,
      AuditAction.CASE_ACCESS,
      AuditTargetType.CASE,
      id,
      { action: "VIEW_TIMELINE" },
    );

    return NextResponse.json({ timeline });
  } catch (error) {
    console.error("GET /api/cases/[id]/timeline error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
