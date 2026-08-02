import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { sendAdminActionMail, sendUserMail } from "@/lib/mail";
import { enqueueQQCaseReviewResult } from "@/lib/qq-notifications";
import { generateAnonymousId } from "@/lib/utils";
import { CaseStatus } from "@prisma/client";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { canonicalCaseRequestSchema } from "@/lib/validators";
import { extractFields, type DelegationInput } from "@/lib/dcr-field-extractor";
import { scanContent } from "@/lib/sensitive-engine";
import { prepareCanonicalDelegation } from "@/lib/dcr-delegation-types";
import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";
import {
  runSerializableTransaction,
  SerializableTransactionConflict,
} from "@/lib/serializable-transaction";

// ==================== Status Flow Rules ====================

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPENED: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["NEED_MORE_INFO", "CLOSED"],
  NEED_MORE_INFO: ["IN_PROGRESS"],
};

const updateStatusSchema = z.union([
  z.object({
    // Keep accepting the legacy body without _action; existing clients send
    // { status, details } for normal workflow transitions.
    _action: z.literal("updateStatus").optional(),
    status: z.enum(["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"]),
    details: z.string().max(500).optional(),
  }),
  z.object({
    _action: z.literal("review"),
    expectedStatus: z.enum(["PENDING", "NEED_MORE_INFO", "APPROVED", "REJECTED", "MANUAL_REVIEW"]),
    requestStatus: z.enum(["PENDING", "NEED_MORE_INFO", "APPROVED", "REJECTED", "MANUAL_REVIEW"]),
    reviewNote: z.string().max(1000).optional(),
  }),
]);

class CaseReviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaseReviewError";
  }
}

class CaseWorkflowError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "CaseWorkflowError";
  }
}

const joinActionSchema = z.object({
  action: z.literal("JOIN"),
});

/**
 * GET /api/cases/[id]
 * Get case detail.
 * - Requires auth
 * - Only submitter, handler, or Admin can view
 * - Logs audit for access
 *
 * Validates: Requirements 11.6, 11.8, 13.4
 */
export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = await context.params;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true, nickname: true } },
        handler: { select: { id: true, nickname: true } },
        handlers: { select: { userId: true, user: { select: { id: true, nickname: true } } } },
        timeline: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      } as Record<string, unknown>,
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    // Full case data is restricted to the submitter, assigned handlers, and administrators.
    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlerId === userId ||
      (caseRecord as any).handlers?.some((h: { userId: string }) => h.userId === userId);
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    if (!isSubmitter && !isHandler && !isAdmin) {
      return NextResponse.json({ error: "无权访问此委托" }, { status: 403 });
    }

    // Log audit for access
    await logAudit(
      userId,
      AuditAction.CASE_ACCESS,
      AuditTargetType.CASE,
      id,
      { action: "VIEW_CASE" },
    );

    return NextResponse.json({ case: caseRecord });
  } catch (error) {
    console.error("GET /api/cases/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

const DELETABLE_REQUEST_STATUSES = [
  "PENDING",
  "NEED_MORE_INFO",
  "REJECTED",
  "MANUAL_REVIEW",
] as const;

/**
 * DELETE /api/cases/[id]
 * Remove a delegation form before it enters the mutual-aid workflow.
 * Approved or already-active cases are retained as workflow/audit records.
 */
export const DELETE = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const { id } = await context.params;

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case:${id}`}))`;
      const caseRecord = await tx.case.findUnique({
        where: { id },
        select: {
          id: true,
          submitterId: true,
          status: true,
          requestStatus: true,
          handlerId: true,
          accessApplication: { select: { id: true, status: true } },
          _count: {
            select: {
              handlers: true,
              posts: true,
              messages: true,
              mutualAidTasks: true,
            },
          },
        },
      });

      if (!caseRecord) return { result: "NOT_FOUND" as const };
      if (caseRecord.submitterId !== userId && !isAdminRole(req.user.role)) {
        return { result: "FORBIDDEN" as const };
      }
      const hasWorkflowRecords = caseRecord.status !== "OPENED"
        || caseRecord.handlerId !== null
        || Object.values(caseRecord._count).some((count) => count > 0);
      if (
        !DELETABLE_REQUEST_STATUSES.includes(caseRecord.requestStatus as typeof DELETABLE_REQUEST_STATUSES[number])
        || hasWorkflowRecords
      ) {
        return { result: "ACTIVE" as const };
      }

      await logAudit(userId, "DELETE_CASE", AuditTargetType.CASE, id, {
        requestStatus: caseRecord.requestStatus,
        deletedBy: caseRecord.submitterId === userId ? "submitter" : "admin",
      }, undefined, tx);
      if (caseRecord.accessApplication) {
        await tx.accessApplication.delete({ where: { id: caseRecord.accessApplication.id } });
      }
      await tx.case.delete({ where: { id } });
      return { result: "DELETED" as const };
    });

    if (deleted.result === "NOT_FOUND") {
      return NextResponse.json({ error: "委托表不存在" }, { status: 404 });
    }
    if (deleted.result === "FORBIDDEN") {
      return NextResponse.json({ error: "无权删除此委托表" }, { status: 403 });
    }
    if (deleted.result === "ACTIVE") {
      return NextResponse.json(
        { error: "已通过审核或已进入互助流程的委托表不能删除" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/cases/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * PATCH /api/cases/[id]
 * Update case status with state machine validation, or handle JOIN action.
 *
 * Status transitions:
 * - OPENED → IN_PROGRESS: DCRHelper accepts (creates CaseHandler + sets handlerId, checks limits)
 * - IN_PROGRESS → NEED_MORE_INFO: DCRHelper requests more info
 * - NEED_MORE_INFO → IN_PROGRESS: submitter provides info
 * - IN_PROGRESS → CLOSED: case resolved
 * - OPENED → CLOSED: submitter cancels
 *
 * JOIN action (action="JOIN"):
 * - OPENED: join + transition to IN_PROGRESS (same as accepting)
 * - IN_PROGRESS: join as additional handler (no status change)
 * - Creates CaseHandler record, TimelineEvent, and notification
 * - Checks handler count < 5 and user's concurrent active cases < 5
 *
 * Validates: Requirements 2.11, 2.12, 3.4, 3.7, 11.1, 11.3, 11.4, 11.5, 11.6, 11.8, 13.1, 13.2, 13.3
 */
export const PATCH = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = await context.params;

    const body = await req.json();

    const isSupplement = body?._action === "supplement";
    const supplement = canonicalCaseRequestSchema.safeParse(body);
    if (isSupplement && supplement.success) {
      const current = await prisma.case.findUnique({ where: { id } });
      if (!current) return NextResponse.json({ error: "委托不存在" }, { status: 404 });
      if (current.submitterId !== userId) return NextResponse.json({ error: "仅提交者可补充材料" }, { status: 403 });
      if (current.requestStatus !== "NEED_MORE_INFO") {
        return NextResponse.json({ error: "当前委托不在待补充状态", code: "CASE_NOT_AWAITING_SUPPLEMENT" }, { status: 409 });
      }
      const { category } = supplement.data;
      const data = prepareCanonicalDelegation(supplement.data.formData);
      const input: DelegationInput = {
        ...data.formData,
        pledgeText: data.pledgeText,
        grade: data.grade,
        timeRange: data.timeRange,
        province: data.province,
        city: data.city,
        expectedHelperProvince: data.expectedHelperProvince,
        riskPreference: data.riskPreference,
      };
      const extraction = extractFields(input);
      let matches;
      try {
        matches = await scanContent(`${Object.values(supplement.data.formData).join(" ")} ${data.pledgeText}`);
      } catch (error) {
        console.error("PATCH /api/cases/[id] sensitive scan error:", error);
        return NextResponse.json(
          { error: "内容安全检查暂时不可用，请稍后重试", code: "SENSITIVE_SCAN_FAILED" },
          { status: 503 },
        );
      }
      if (matches.length > 0) {
        return NextResponse.json(
          { error: "委托内容包含敏感或可识别信息，请修改后重试", code: "SENSITIVE_CONTENT" },
          { status: 422 },
        );
      }
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.case.updateMany({
          where: { id, submitterId: userId, requestStatus: "NEED_MORE_INFO" },
          data: {
            category,
            formData: data.formData as unknown as Prisma.InputJsonValue,
            pledgeText: data.pledgeText,
            grade: data.grade,
            timeRange: data.timeRange,
            province: data.province,
            city: data.city,
            expectedHelperProvince: data.expectedHelperProvince,
            riskPreference: data.riskPreference,
            extractedFields: extraction.extractedFields as Prisma.InputJsonValue,
            missingFields: extraction.missingFields,
            sensitiveHitCount: 0,
            requestStatus: "PENDING",
            reviewNote: "补充材料已提交，等待管理员重新审核",
          },
        });
        if (result.count === 0) return null;
        await tx.accessApplication.updateMany({
          where: { caseId: id, applicantId: userId, type: "DCR", status: "PENDING" },
          data: { pledgeText: data.pledgeText },
        });
        await tx.timelineEvent.create({
          data: { caseId: id, action: "提交补充材料", oldStatus: "NEED_MORE_INFO", newStatus: "PENDING" },
        });
        await logAudit(userId, "SUPPLEMENT_CASE", "CASE", id, {
          oldRequestStatus: "NEED_MORE_INFO",
          newRequestStatus: "PENDING",
        }, undefined, tx);
        return tx.case.findUnique({ where: { id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (!updated) {
        return NextResponse.json({ error: "委托审核状态已变化", code: "CASE_NOT_AWAITING_SUPPLEMENT" }, { status: 409 });
      }
      await sendAdminActionMail({
        minimumRole: "MODERATOR",
        subject: "委托补充材料待复审",
        text: `委托 ${id} 已提交补充材料并重新进入审核队列。`,
        actionUrl: "/admin/dcr/reviews?requestStatus=PENDING",
      });
      return NextResponse.json({ case: updated });
    }

    if (isSupplement && !supplement.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: supplement.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Check if this is a JOIN action
    const joinParsed = joinActionSchema.safeParse(body);
    if (joinParsed.success) {
      return handleJoinAction(userId, userRole, id);
    }

    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const patchData = parsed.data;

    // ---- 审核状态更新 (管理员专用) ----
    if (patchData._action === "review") {
      const { expectedStatus, requestStatus: newRequestStatus, reviewNote } = patchData;
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN" && userRole !== "MODERATOR") {
        return NextResponse.json({ error: "仅管理员可修改审核状态" }, { status: 403 });
      }

      const reviewResult = await runSerializableTransaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case:${id}`}))`;
        const caseRecord = await tx.case.findUnique({
          where: { id },
          include: {
            accessApplication: {
              include: {
                applicant: {
                  select: {
                    id: true,
                    role: true,
                    createdAt: true,
                    phone: true,
                    quizPassed: true,
                    violationCount: true,
                    dcrAccess: true,
                    dcrPledgeSigned: true,
                  },
                },
              },
            },
          },
        });
        if (!caseRecord) return null;
        if (caseRecord.requestStatus !== expectedStatus) {
          throw new CaseReviewError(409, "CASE_REVIEW_STATUS_CHANGED", "委托审核状态已变化，请刷新后重试");
        }

        const updatedCount = await tx.case.updateMany({
          where: { id, requestStatus: expectedStatus },
          data: {
            requestStatus: newRequestStatus,
            reviewNote: reviewNote ?? null,
          },
        });
        if (updatedCount.count !== 1) {
          throw new CaseReviewError(409, "CASE_REVIEW_STATUS_CHANGED", "委托审核状态已变化，请刷新后重试");
        }

        let autoApprovedApplicationId: string | null = null;
        let rejectedApplicationId: string | null = null;
        const application = caseRecord.accessApplication;
        if (
          newRequestStatus === "APPROVED"
          && application?.type === "DCR"
          && application.status === "PENDING"
        ) {
          const activeDcrUserCount = await tx.user.count({ where: { dcrAccess: true } });
          const decision = evaluateDcrAdmission({
            stage: "APPROVE_APPLICATION",
            user: application.applicant,
            application: {
              id: application.id,
              applicantId: application.applicantId,
              caseId: application.caseId,
              status: application.status,
              pledgeText: application.pledgeText,
            },
            case: {
              id: caseRecord.id,
              submitterId: caseRecord.submitterId,
              requestStatus: newRequestStatus,
            },
            activeDcrUserCount,
          });
          if (!decision.allowed) {
            throw new CaseReviewError(403, decision.code, decision.reason);
          }
          const applicationUpdated = await tx.accessApplication.updateMany({
            where: { id: application.id, status: "PENDING" },
            data: {
              status: "APPROVED",
              reviewNote: reviewNote ?? "委托表审核通过，准入申请自动通过",
              reviewedAt: new Date(),
            },
          });
          if (applicationUpdated.count !== 1) {
            throw new CaseReviewError(409, "APPLICATION_NOT_PENDING", "关联准入申请已被其他管理员处理");
          }
          await tx.user.update({
            where: { id: application.applicantId },
            data: { dcrAccess: true, dcrPledgeSigned: true },
          });
          autoApprovedApplicationId = application.id;
        } else if (
          newRequestStatus === "REJECTED"
          && application?.type === "DCR"
          && application.status === "PENDING"
        ) {
          const applicationUpdated = await tx.accessApplication.updateMany({
            where: { id: application.id, status: "PENDING" },
            data: {
              status: "REJECTED",
              reviewNote: reviewNote ?? "关联委托审核未通过",
              reviewedAt: new Date(),
            },
          });
          if (applicationUpdated.count !== 1) {
            throw new CaseReviewError(409, "APPLICATION_NOT_PENDING", "关联准入申请已被其他管理员处理");
          }
          rejectedApplicationId = application.id;
        }

        await tx.timelineEvent.create({
          data: {
            caseId: id,
            action: "委托审核",
            oldStatus: String(caseRecord.requestStatus),
            newStatus: newRequestStatus,
            details: autoApprovedApplicationId
              ? `${reviewNote ? `${reviewNote}；` : ""}委托审核通过，DCR 准入申请已自动通过`
              : reviewNote ?? `管理员将审核状态更新为 ${newRequestStatus}`,
          },
        });

        const updated = await tx.case.findUnique({ where: { id } });
        return { caseRecord, updated, autoApprovedApplicationId, rejectedApplicationId };
      });

      if (!reviewResult) {
        return NextResponse.json({ error: "委托不存在" }, { status: 404 });
      }
      const { caseRecord, updated, autoApprovedApplicationId, rejectedApplicationId } = reviewResult;

      // Log audit
      await logAudit(
        userId,
        "REVIEW_CASE",
        AuditTargetType.CASE,
        id,
        { oldRequestStatus: caseRecord.requestStatus, newRequestStatus, reviewNote },
      );
      if (autoApprovedApplicationId) {
        await logAudit(
          userId,
          AuditAction.DCR_ACCESS_GRANT,
          AuditTargetType.APPLICATION,
          autoApprovedApplicationId,
          { applicantId: caseRecord.submitterId, caseId: id, source: "CASE_REVIEW_APPROVED" },
        );
      }
      if (rejectedApplicationId) {
        await logAudit(
          userId,
          AuditAction.DCR_ACCESS_REVOKE,
          AuditTargetType.APPLICATION,
          rejectedApplicationId,
          { applicantId: caseRecord.submitterId, caseId: id, source: "CASE_REVIEW_REJECTED" },
        );
      }

      const reviewStatusLabels: Record<string, string> = {
        PENDING: "待审核",
        NEED_MORE_INFO: "需补充信息",
        MANUAL_REVIEW: "人工审核中",
        APPROVED: "审核通过",
        REJECTED: "审核未通过",
      };
      const statusLabel = reviewStatusLabels[newRequestStatus] ?? newRequestStatus;
      const notificationTitle =
        newRequestStatus === "APPROVED"
          ? "委托表审核已通过"
          : "委托表审核结果更新";
      const notificationContent = autoApprovedApplicationId
        ? `您的委托表${statusLabel}，DCR 准入申请已自动通过，现在可以进入 DCR 区${reviewNote ? `。审核说明：${reviewNote}` : ""}`
        : `您的委托表${statusLabel}${reviewNote ? `，审核说明：${reviewNote}` : ""}`;

      // The review is already committed; delivery failures must not change its API result.
      const sideEffects: Promise<unknown>[] = [
        createNotification(
          caseRecord.submitterId,
          "SYSTEM",
          notificationTitle,
          notificationContent,
          `/dcr/tickets/${id}`,
        ),
        sendUserMail({
          userId: caseRecord.submitterId,
          subject: notificationTitle,
          text: `${notificationContent}。\n\n查看委托：${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/dcr/tickets/${id}`,
        }),
        enqueueQQCaseReviewResult(caseRecord.submitterId, id, String(caseRecord.category), newRequestStatus),
      ];
      if (newRequestStatus === "PENDING" || newRequestStatus === "MANUAL_REVIEW") {
        sideEffects.push(sendAdminActionMail({
          minimumRole: "MODERATOR",
          subject: "委托需要继续审核",
          text: `委托 ${id} 已转为${newRequestStatus === "MANUAL_REVIEW" ? "人工审核" : "待审核"}状态。`,
          actionUrl: `/admin/dcr/reviews?requestStatus=${newRequestStatus}`,
        }));
      }
      await Promise.allSettled(sideEffects);

      return NextResponse.json({
        case: updated,
        requestStatus: newRequestStatus,
        admissionAutoApproved: Boolean(autoApprovedApplicationId),
        admissionAutoRejected: Boolean(rejectedApplicationId),
      });
    }

    // ---- 原有状态更新逻辑 ----
    const { status: newStatus, details } = patchData;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true } },
        handler: { select: { id: true } },
        handlers: { select: { userId: true } },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    const oldStatus = caseRecord.status;

    if (
      oldStatus === "OPENED" && newStatus === "IN_PROGRESS" &&
      caseRecord.requestStatus !== "APPROVED"
    ) {
      return NextResponse.json(
        { error: "该委托仍在管理员审核中，审核通过后才能接单" },
        { status: 409 },
      );
    }

    // Validate status transition
    const allowedTransitions = VALID_TRANSITIONS[oldStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        { error: `不允许从 ${oldStatus} 转换到 ${newStatus}` },
        { status: 400 },
      );
    }

    // Permission checks based on transition
    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlerId === userId
      || caseRecord.handlers?.some((handler) => handler.userId === userId) === true;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    const helperProfile = userRole === "DCR_HELPER" || isAdmin
      ? null
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { dcrHelperAccess: true, dcrAccess: true },
        });
    const helperAccess = userRole === "DCR_HELPER" || isAdmin
      || !!helperProfile?.dcrHelperAccess || !!helperProfile?.dcrAccess;
    const isDCRHelper = helperAccess;

    // OPENED → IN_PROGRESS: DCRHelper accepts case
    if (oldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
      if (isSubmitter) {
        return NextResponse.json({ error: "不能接取自己提交的委托" }, { status: 403 });
      }
      if (!isDCRHelper) {
        return NextResponse.json({ error: "仅 DCRHelper 或 Admin 可接单" }, { status: 403 });
      }

      // Check concurrent limit via CaseHandler: max 5 active cases per user
      const activeCaseCount = await prisma.caseHandler.count({
        where: {
          userId,
          case_: { status: { in: [CaseStatus.IN_PROGRESS, CaseStatus.NEED_MORE_INFO] } },
        },
      });

      if (activeCaseCount >= 5) {
        return NextResponse.json(
          { error: "已达到同时处理委托上限（5 个）" },
          { status: 400 },
        );
      }
    }

    // OPENED → CLOSED: only submitter can cancel
    if (oldStatus === "OPENED" && newStatus === "CLOSED") {
      if (!isSubmitter && !isAdmin) {
        return NextResponse.json({ error: "仅提交者或 Admin 可取消委托" }, { status: 403 });
      }
    }

    // IN_PROGRESS → NEED_MORE_INFO: only handler or Admin
    if (oldStatus === "IN_PROGRESS" && newStatus === "NEED_MORE_INFO") {
      if (!isHandler && !isAdmin) {
        return NextResponse.json({ error: "仅处理者或 Admin 可请求补充信息" }, { status: 403 });
      }
    }

    // NEED_MORE_INFO → IN_PROGRESS: only submitter
    if (oldStatus === "NEED_MORE_INFO" && newStatus === "IN_PROGRESS") {
      if (!isSubmitter && !isAdmin) {
        return NextResponse.json({ error: "仅提交者或 Admin 可补充信息" }, { status: 403 });
      }
    }

    // IN_PROGRESS → CLOSED: only handler or Admin
    if (oldStatus === "IN_PROGRESS" && newStatus === "CLOSED") {
      if (!isHandler && !isAdmin) {
        return NextResponse.json({ error: "仅处理者或 Admin 可关闭委托" }, { status: 403 });
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = { status: newStatus };

    // If accepting case (OPENED → IN_PROGRESS), assign handler
    if (oldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
      updateData.handlerId = userId;
    }

    // Determine timeline action description
    let actionDesc = `状态变更: ${oldStatus} → ${newStatus}`;
    if (oldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
      actionDesc = "DCRHelper 接单";
    } else if (oldStatus === "IN_PROGRESS" && newStatus === "NEED_MORE_INFO") {
      actionDesc = "请求补充信息";
    } else if (oldStatus === "NEED_MORE_INFO" && newStatus === "IN_PROGRESS") {
      actionDesc = "已补充信息";
    } else if (newStatus === "CLOSED") {
      actionDesc = oldStatus === "OPENED" ? "提交者取消委托" : "委托已关闭";
    }

    // Update case + create timeline event + CaseHandler in transaction
    const updatedCase = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case:${id}`}))`;
      const lockedCase = await tx.case.findUnique({
        where: { id },
        include: { handlers: { select: { userId: true } } },
      });
      if (!lockedCase) throw new CaseWorkflowError(404, "委托不存在");
      const lockedOldStatus = lockedCase.status;
      if (!VALID_TRANSITIONS[lockedOldStatus]?.includes(newStatus)) {
        throw new CaseWorkflowError(409, `不允许从 ${lockedOldStatus} 转换到 ${newStatus}`);
      }
      const lockedIsSubmitter = lockedCase.submitterId === userId;
      const lockedIsHandler = lockedCase.handlerId === userId
        || lockedCase.handlers?.some((handler) => handler.userId === userId) === true;
      if (lockedOldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
        if (lockedCase.requestStatus !== "APPROVED") throw new CaseWorkflowError(409, "该委托仍在管理员审核中，审核通过后才能接单");
        if (lockedIsSubmitter) throw new CaseWorkflowError(403, "不能接取自己提交的委托");
        const activeCaseCount = await tx.caseHandler.count({
          where: { userId, case_: { status: { in: [CaseStatus.IN_PROGRESS, CaseStatus.NEED_MORE_INFO] } } },
        });
        if (activeCaseCount >= 5) throw new CaseWorkflowError(409, "已达到同时处理委托上限（5 个）");
      }
      if (lockedOldStatus === "OPENED" && newStatus === "CLOSED" && !lockedIsSubmitter && !isAdmin) {
        throw new CaseWorkflowError(403, "仅提交者或 Admin 可取消委托");
      }
      if (lockedOldStatus === "IN_PROGRESS" && newStatus === "NEED_MORE_INFO" && !lockedIsHandler && !isAdmin) {
        throw new CaseWorkflowError(403, "仅处理者或 Admin 可请求补充信息");
      }
      if (lockedOldStatus === "NEED_MORE_INFO" && newStatus === "IN_PROGRESS" && !lockedIsSubmitter && !isAdmin) {
        throw new CaseWorkflowError(403, "仅提交者或 Admin 可补充信息");
      }
      if (lockedOldStatus === "IN_PROGRESS" && newStatus === "CLOSED" && !lockedIsHandler && !isAdmin) {
        throw new CaseWorkflowError(403, "仅处理者或 Admin 可关闭委托");
      }

      const lockedUpdateData: Record<string, unknown> = { status: newStatus };
      if (lockedOldStatus === "OPENED" && newStatus === "IN_PROGRESS") lockedUpdateData.handlerId = userId;
      let lockedActionDesc = `状态变更: ${lockedOldStatus} → ${newStatus}`;
      if (lockedOldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
        lockedActionDesc = "DCRHelper 接单";
      } else if (lockedOldStatus === "IN_PROGRESS" && newStatus === "NEED_MORE_INFO") {
        lockedActionDesc = "请求补充信息";
      } else if (lockedOldStatus === "NEED_MORE_INFO" && newStatus === "IN_PROGRESS") {
        lockedActionDesc = "已补充信息";
      } else if (newStatus === "CLOSED") {
        lockedActionDesc = lockedOldStatus === "OPENED" ? "提交者取消委托" : "委托已关闭";
      }
      const updated = await tx.case.update({
        where: { id },
        data: lockedUpdateData,
        include: {
          submitter: { select: { id: true, nickname: true } },
          handler: { select: { id: true, nickname: true } },
        },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: id,
          action: lockedActionDesc,
          oldStatus: lockedOldStatus,
          newStatus,
          details: details ?? null,
        },
      });

      // If accepting case (OPENED → IN_PROGRESS), create CaseHandler record + session channel
      if (lockedOldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
        await tx.caseHandler.create({
          data: { caseId: id, userId },
        });

        await tx.user.update({
          where: { id: userId },
          data: { dcrHelperAccess: true },
        });

        const anonymousId = generateAnonymousId();
        await tx.message.create({
          data: {
            content: `会话通道已建立。匿名标识: ${anonymousId}`,
            isAnonymous: true,
            senderId: userId,
            receiverId: lockedCase.submitterId,
            caseId: id,
          },
        });
      }

      return updated;
    });

    // Send notification to relevant party
    const notifyUserId =
      oldStatus === "OPENED" && newStatus === "IN_PROGRESS"
        ? caseRecord.submitterId
        : oldStatus === "IN_PROGRESS" && newStatus === "NEED_MORE_INFO"
          ? caseRecord.submitterId
          : oldStatus === "NEED_MORE_INFO" && newStatus === "IN_PROGRESS"
            ? caseRecord.handlerId
            : newStatus === "CLOSED"
              ? caseRecord.submitterId
              : null;

    if (notifyUserId && notifyUserId !== userId) {
      await createNotification(
        notifyUserId,
        "CASE_UPDATE",
        "委托状态更新",
        `您的委托状态已更新为 ${newStatus}`,
        `/dcr/tickets/${id}`,
      );
    }

    // Log audit
    await logAudit(
      userId,
      "UPDATE_CASE_STATUS",
      AuditTargetType.CASE,
      id,
      { oldStatus, newStatus, details },
    );

    return NextResponse.json({ case: updatedCase });
  } catch (error) {
    if (error instanceof CaseReviewError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof CaseWorkflowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SerializableTransactionConflict) {
      return NextResponse.json(
        { error: "委托审核状态冲突，请刷新后重试", code: "CASE_REVIEW_CONFLICT" },
        { status: 409 },
      );
    }
    console.error("PATCH /api/cases/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * Handle JOIN action: allow a DCR_HELPER to join a case.
 * - OPENED case: join + transition to IN_PROGRESS (first handler becomes primary)
 * - IN_PROGRESS case: join as additional handler (no status change)
 * - Checks: handler count < 5, user's active case count < 5
 * - Creates CaseHandler, TimelineEvent, notification
 *
 * Validates: Requirements 2.11, 2.12, 3.4, 3.7
 */
async function handleJoinAction(userId: string, userRole: string, caseId: string) {
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  // Check if user is a DCR_HELPER or has dcrAccess
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { dcrAccess: true, dcrHelperAccess: true },
  });
  const isDCRHelper = userRole === "DCR_HELPER" || !!userRecord?.dcrHelperAccess || !!userRecord?.dcrAccess || isAdmin;

  if (!isDCRHelper) {
    return NextResponse.json({ error: "仅 DCRHelper 或 Admin 可加入工单" }, { status: 403 });
  }

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      submitter: { select: { id: true } },
      handler: { select: { id: true } },
      handlers: { select: { userId: true } },
    } as Record<string, unknown>,
  });

  if (!caseRecord) {
    return NextResponse.json({ error: "委托不存在" }, { status: 404 });
  }

  if (caseRecord.requestStatus !== "APPROVED") {
    return NextResponse.json(
      { error: "该委托仍在管理员审核中，审核通过后才能加入" },
      { status: 409 },
    );
  }

  if (caseRecord.submitterId === userId) {
    return NextResponse.json({ error: "不能加入自己提交的委托" }, { status: 403 });
  }

  // Type assertion for handlers field from CaseHandler relation
  const caseWithHandlers = caseRecord as typeof caseRecord & { handlers: { userId: string }[] };

  // JOIN only allowed in OPENED or IN_PROGRESS
  if (caseRecord.status !== "OPENED" && caseRecord.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: `当前状态 ${caseRecord.status} 不允许加入` },
      { status: 400 },
    );
  }

  // Check if user is already a handler
  const alreadyHandler = caseWithHandlers.handlers.some((h) => h.userId === userId);
  if (alreadyHandler) {
    return NextResponse.json({ error: "您已是该工单的处理者" }, { status: 400 });
  }

  // Check handler count for this case < 5
  if (caseWithHandlers.handlers.length >= 5) {
    return NextResponse.json(
      { error: "该工单处理者已达上限（5 人）" },
      { status: 400 },
    );
  }

  // Check user's concurrent active cases < 5 (via CaseHandler + Case status)
  const userActiveCaseCount = await prisma.caseHandler.count({
    where: {
      userId,
      case_: { status: { in: [CaseStatus.IN_PROGRESS, CaseStatus.NEED_MORE_INFO] } },
    },
  });

  if (userActiveCaseCount >= 5) {
    return NextResponse.json(
      { error: "已达到同时处理委托上限（5 个）" },
      { status: 400 },
    );
  }

  const oldStatus = caseRecord.status;
  const isOpenedCase = oldStatus === "OPENED";

  // Build transaction
  const joinResult = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`case:${caseId}`}))`;
    const lockedCase = await tx.case.findUnique({
      where: { id: caseId },
      include: { handlers: { select: { userId: true } } },
    });
    if (!lockedCase) throw new CaseWorkflowError(404, "委托不存在");
    if (lockedCase.requestStatus !== "APPROVED") throw new CaseWorkflowError(409, "该委托仍在管理员审核中，审核通过后才能加入");
    if (lockedCase.submitterId === userId) throw new CaseWorkflowError(403, "不能加入自己提交的委托");
    if (lockedCase.status !== "OPENED" && lockedCase.status !== "IN_PROGRESS") {
      throw new CaseWorkflowError(409, `当前状态 ${lockedCase.status} 不允许加入`);
    }
    if (lockedCase.handlers.some((handler) => handler.userId === userId)) {
      throw new CaseWorkflowError(409, "您已是该工单的处理者");
    }
    if (lockedCase.handlers.length >= 5) throw new CaseWorkflowError(409, "该工单处理者已达上限（5 人）");
    const activeCaseCount = await tx.caseHandler.count({
      where: { userId, case_: { status: { in: [CaseStatus.IN_PROGRESS, CaseStatus.NEED_MORE_INFO] } } },
    });
    if (activeCaseCount >= 5) throw new CaseWorkflowError(409, "已达到同时处理委托上限（5 个）");
    const lockedOldStatus = lockedCase.status;
    const lockedIsOpenedCase = lockedOldStatus === "OPENED";

    // Create CaseHandler record
    await tx.caseHandler.create({
      data: { caseId, userId },
    });

    await tx.user.update({
      where: { id: userId },
      data: { dcrHelperAccess: true },
    });

    // If OPENED, transition to IN_PROGRESS and set handlerId (primary handler)
    const updateData: Record<string, unknown> = {};
    if (lockedIsOpenedCase) {
      updateData.status = "IN_PROGRESS";
      updateData.handlerId = userId;
    }

    const updated = await tx.case.update({
      where: { id: caseId },
      data: Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() },
      include: {
        submitter: { select: { id: true, nickname: true } },
        handler: { select: { id: true, nickname: true } },
      },
    });

    // Create timeline event
    const actionDesc = lockedIsOpenedCase ? "DCRHelper 接单" : "DCRHelper 加入协助";
    const newStatus = lockedIsOpenedCase ? "IN_PROGRESS" : lockedOldStatus;
    await tx.timelineEvent.create({
      data: {
        caseId,
        action: actionDesc,
        oldStatus: lockedOldStatus,
        newStatus,
        details: null,
      },
    });

    // If OPENED → IN_PROGRESS, create session channel message
    if (lockedIsOpenedCase) {
      const anonymousId = generateAnonymousId();
      await tx.message.create({
        data: {
          content: `会话通道已建立。匿名标识: ${anonymousId}`,
          isAnonymous: true,
          senderId: userId,
          receiverId: lockedCase.submitterId,
          caseId,
        },
      });
    }

    return { updated, oldStatus: lockedOldStatus, isOpenedCase: lockedIsOpenedCase, submitterId: lockedCase.submitterId };
  });
  const { updated: updatedCase, oldStatus: lockedOldStatus, isOpenedCase: lockedIsOpenedCase } = joinResult;

  // Send notification to submitter
  if (caseRecord.submitterId !== userId) {
    const notifBody = lockedIsOpenedCase
      ? "您的委托已被接单，状态已更新为 IN_PROGRESS"
      : "有新的协助者加入了您的委托";
    await createNotification(
      caseRecord.submitterId,
      "CASE_UPDATE",
      "委托状态更新",
      notifBody,
      `/dcr/tickets/${caseId}`,
    );
  }

  // Log audit
  await logAudit(
    userId,
    "UPDATE_CASE_STATUS",
    AuditTargetType.CASE,
    caseId,
    { action: "JOIN", oldStatus: lockedOldStatus, newStatus: lockedIsOpenedCase ? "IN_PROGRESS" : lockedOldStatus },
  );

  return NextResponse.json({ case: updatedCase });
}
