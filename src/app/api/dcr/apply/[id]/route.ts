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

/** Cold start limit: max 50 DCR users */
const DCR_COLD_START_LIMIT = 50;

/** Minimum account age in days */
const MIN_ACCOUNT_AGE_DAYS = 7;

/** Maximum allowed violations */
const MAX_VIOLATION_COUNT = 3;

/** Minimum reputation score */
const MIN_REPUTATION_SCORE = 60;

/**
 * PATCH /api/dcr/apply/[id]
 * Admin reviews a DCR zone access application.
 * - Requires ADMIN role
 * - If APPROVED: checks cold start limit, account age, violations, reputation
 * - If all checks pass: sets dcrAccess=true, dcrPledgeSigned=true
 * - Promotes USER/TRUSTED_USER to DCR_HELPER (grants handle_dcr_cases permission)
 * - Higher roles (MODERATOR+) keep their role but gain dcrAccess for case handling
 * - If REJECTED: updates status with reviewNote
 * - Creates notification for applicant
 * - Logs to AuditLog
 *
 * Validates: Requirements 9.2, 9.3, 9.4
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
      return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    }

    if (application.type !== "DCR") {
      return NextResponse.json({ error: "该申请不是 DCR 准入申请" }, { status: 400 });
    }

    if (application.status !== "PENDING") {
      return NextResponse.json({ error: "该申请已被审核" }, { status: 409 });
    }

    if (status === "APPROVED") {
      // Check cold start limit
      const dcrUserCount = await prisma.user.count({
        where: { dcrAccess: true },
      });

      if (dcrUserCount >= DCR_COLD_START_LIMIT) {
        return NextResponse.json(
          { error: "DCR 区已达冷启动限额（50 名用户），暂时无法批准新申请" },
          { status: 403 },
        );
      }

      // Fetch applicant info for eligibility checks
      const applicant = await prisma.user.findUnique({
        where: { id: application.applicantId },
        select: { createdAt: true, violationCount: true, reputationScore: true },
      });

      if (!applicant) {
        return NextResponse.json({ error: "申请人不存在" }, { status: 404 });
      }

      // Check account age >= 7 days
      const accountAgeDays = (Date.now() - applicant.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
        return NextResponse.json(
          { error: "申请人账号年龄不足 7 天" },
          { status: 403 },
        );
      }

      // Check violation count < 3
      if (applicant.violationCount >= MAX_VIOLATION_COUNT) {
        return NextResponse.json(
          { error: "申请人违规记录过多" },
          { status: 403 },
        );
      }

      // Check reputation score >= 60
      if (applicant.reputationScore < MIN_REPUTATION_SCORE) {
        return NextResponse.json(
          { error: "申请人信誉等级不足" },
          { status: 403 },
        );
      }

      // All checks passed — approve
      const updatedApplication = await prisma.accessApplication.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewNote: reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });

      // Grant DCR access + promote to DCR_HELPER if role is USER or TRUSTED_USER
      const applicantUser = await prisma.user.findUnique({
        where: { id: application.applicantId },
        select: { role: true },
      });

      const shouldPromote =
        applicantUser?.role === "USER" || applicantUser?.role === "TRUSTED_USER";

      await prisma.user.update({
        where: { id: application.applicantId },
        data: {
          dcrAccess: true,
          dcrPledgeSigned: true,
          ...(shouldPromote ? { role: "DCR_HELPER" } : {}),
        },
      });

      // Notification
      await createNotification(
        application.applicantId,
        "DCR_ACCESS",
        "DCR 准入申请已通过",
        "您的 DCR 私密区准入申请已通过审核，现在可以访问 DCR 区并接受互助委托了",
        "/dcr",
      );

      // Audit log
      await logAudit(
        req.user.id,
        AuditAction.DCR_ACCESS_GRANT,
        AuditTargetType.APPLICATION,
        id,
        {
          applicantId: application.applicantId,
          decision: "APPROVED",
          reviewNote: reviewNote ?? null,
          rolePromoted: shouldPromote ? "DCR_HELPER" : null,
        },
      );

      return NextResponse.json({ application: updatedApplication });
    }

    // REJECTED path
    const updatedApplication = await prisma.accessApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewNote: reviewNote ?? null,
        reviewedAt: new Date(),
      },
    });

    // Notification
    await createNotification(
      application.applicantId,
      "DCR_ACCESS",
      "DCR 准入申请未通过",
      `您的 DCR 私密区准入申请未通过审核${reviewNote ? `，原因：${reviewNote}` : ""}`,
    );

    // Audit log
    await logAudit(
      req.user.id,
      AuditAction.DCR_ACCESS_GRANT,
      AuditTargetType.APPLICATION,
      id,
      {
        applicantId: application.applicantId,
        decision: "REJECTED",
        reviewNote: reviewNote ?? null,
      },
    );

    return NextResponse.json({ application: updatedApplication });
  } catch (error) {
    console.error("PATCH /api/dcr/apply/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
