import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

/**
 * Valid status transitions:
 * PENDING → IN_PROGRESS
 * IN_PROGRESS → RESOLVED | DISMISSED
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED", "DISMISSED"],
};

const updateReportSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RESOLVED", "DISMISSED"]),
  resolution: z.string().max(2000).optional(),
});

/**
 * PATCH /api/reports/[id]
 * Update report status. Moderator+ only.
 * - Enforces valid status transitions: PENDING → IN_PROGRESS → RESOLVED/DISMISSED
 * - Records all status changes to AuditLog
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = context.params;

    const body = await req.json();
    const parsed = updateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { status: newStatus, resolution } = parsed.data;

    const existing = await prisma.report.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "举报不存在" }, { status: 404 });
    }

    // Validate status transition
    const allowedTransitions = VALID_TRANSITIONS[existing.status];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: "无效的状态流转",
          detail: `不能从 ${existing.status} 转换到 ${newStatus}`,
        },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (resolution !== undefined) {
      updateData.resolution = resolution;
    }

    const report = await prisma.report.update({
      where: { id },
      data: updateData,
    });

    // Determine audit action based on new status
    const auditAction =
      newStatus === "RESOLVED" || newStatus === "IN_PROGRESS"
        ? AuditAction.REPORT_RESOLVE
        : AuditAction.REPORT_DISMISS;

    await logAudit(
      req.user.id,
      auditAction,
      AuditTargetType.REPORT,
      id,
      {
        previousStatus: existing.status,
        newStatus,
        resolution: resolution ?? null,
      },
    );

    return NextResponse.json({ report });
  } catch (error) {
    console.error("PATCH /api/reports/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
