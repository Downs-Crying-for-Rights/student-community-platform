import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { z } from "zod";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(),
});

/**
 * PATCH /api/psych/apply/[id]
 * Moderator reviews a psychology zone access application.
 * - Requires MODERATOR role
 * - If APPROVED: sets user's psychAccess = true, updates application status
 * - If REJECTED: updates application status with reviewNote
 * - Creates notification for the applicant
 * - Logs to AuditLog
 *
 * Validates: Requirements 8.1, 8.2
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { status, reviewNote } = parsed.data;

    // Find the application
    const application = await prisma.accessApplication.findUnique({
      where: { id },
    });

    if (!application) {
      return NextResponse.json(
        { error: "申请不存在" },
        { status: 404 },
      );
    }

    if (application.status !== "PENDING") {
      return NextResponse.json(
        { error: "该申请已被审核" },
        { status: 409 },
      );
    }

    // Update application
    const updatedApplication = await prisma.accessApplication.update({
      where: { id },
      data: {
        status,
        reviewNote: reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });

    // If approved, grant psychAccess
    if (status === "APPROVED") {
      await prisma.user.update({
        where: { id: application.applicantId },
        data: { psychAccess: true },
      });
    }

    // Create notification for the applicant
    const notificationTitle = status === "APPROVED"
      ? "心理区准入申请已通过"
      : "心理区准入申请未通过";
    const notificationContent = status === "APPROVED"
      ? "您的心理交流区准入申请已通过审核，现在可以访问心理交流区了"
      : `您的心理交流区准入申请未通过审核${reviewNote ? `，原因：${reviewNote}` : ""}`;

    await createNotification(
      application.applicantId,
      "SYSTEM",
      notificationTitle,
      notificationContent,
      status === "APPROVED" ? "/apply" : undefined,
    );

    // Log to AuditLog
    await logAudit(
      req.user.id,
      AuditAction.PSYCH_ACCESS_GRANT,
      AuditTargetType.APPLICATION,
      id,
      {
        applicantId: application.applicantId,
        decision: status,
        reviewNote: reviewNote ?? null,
      },
    );

    return NextResponse.json({ application: updatedApplication });
  } catch (error) {
    console.error("PATCH /api/psych/apply/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
