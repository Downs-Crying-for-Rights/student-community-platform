import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { sendUserMail } from "@/lib/mail";
import { z } from "zod";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(),
});

class PsychReviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PsychReviewError";
  }
}

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

    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.accessApplication.findUnique({ where: { id } });

      if (!application) {
        throw new PsychReviewError(404, "APPLICATION_NOT_FOUND", "申请不存在");
      }
      if (application.type !== "PSYCHOLOGY") {
        throw new PsychReviewError(
          400,
          "APPLICATION_TYPE_INVALID",
          "该申请不是心理区准入申请",
        );
      }
      if (application.status !== "PENDING") {
        throw new PsychReviewError(409, "APPLICATION_NOT_PENDING", "该申请已被审核");
      }

      const updated = await tx.accessApplication.updateMany({
        where: { id, type: "PSYCHOLOGY", status: "PENDING" },
        data: {
          status,
          reviewNote: reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new PsychReviewError(
          409,
          "APPLICATION_NOT_PENDING",
          "该申请已被其他审核员处理",
        );
      }

      const accessGranted = status === "APPROVED";
      if (accessGranted) {
        await tx.user.update({
          where: { id: application.applicantId },
          data: { psychAccess: true },
        });
      }

      await tx.auditLog.create({
        data: {
          operatorId: req.user.id,
          action: status === "APPROVED"
            ? AuditAction.PSYCH_ACCESS_GRANT
            : AuditAction.PSYCH_ACCESS_REJECT,
          targetType: AuditTargetType.APPLICATION,
          targetId: id,
          details: {
            applicantId: application.applicantId,
            applicationType: application.type,
            decision: status,
            psychAccessGranted: accessGranted,
            reviewNote: reviewNote ?? null,
          },
        },
      });

      return {
        application: await tx.accessApplication.findUnique({ where: { id } }),
        applicantId: application.applicantId,
      };
    });

    // Create notification for the applicant
    const notificationTitle = status === "APPROVED"
      ? "心理区准入申请已通过"
      : "心理区准入申请未通过";
    const notificationContent = status === "APPROVED"
      ? "您的心理交流区准入申请已通过审核，现在可以访问心理交流区了"
      : `您的心理交流区准入申请未通过审核${reviewNote ? `，原因：${reviewNote}` : ""}`;

    const sideEffects = await Promise.allSettled([
      createNotification(
        result.applicantId,
        "SYSTEM",
        notificationTitle,
        notificationContent,
        status === "APPROVED" ? "/psych" : undefined,
      ),
      sendUserMail({
        userId: result.applicantId,
        subject: notificationTitle,
        text: `${notificationContent}。${status === "APPROVED" ? `\n\n访问：${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/psych` : ""}`,
      }),
    ]);
    for (const sideEffect of sideEffects) {
      if (sideEffect.status === "rejected") {
        console.error("Psych review side effect failed:", sideEffect.reason);
      }
    }

    return NextResponse.json({ application: result.application });
  } catch (error) {
    if (error instanceof PsychReviewError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("PATCH /api/psych/apply/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR", { captureAllTelemetry: true });
