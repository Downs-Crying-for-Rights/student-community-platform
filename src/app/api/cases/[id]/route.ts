import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { generateAnonymousId } from "@/lib/utils";
import { z } from "zod";

// ==================== Status Flow Rules ====================

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPENED: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["NEED_MORE_INFO", "CLOSED"],
  NEED_MORE_INFO: ["IN_PROGRESS"],
};

const updateStatusSchema = z.object({
  status: z.enum(["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"]),
  details: z.string().max(500).optional(),
});

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
        timeline: { orderBy: { createdAt: "asc" } },
      } as Record<string, unknown>,
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    // Access control: submitter, handler, Admin, or DCRHelper viewing OPENED cases
    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlerId === userId ||
      (caseRecord as any).handlers?.some((h: { userId: string }) => h.userId === userId);
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    // DCR helpers can view OPENED cases (needed to decide whether to accept)
    let isDCRHelperViewingOpen = false;
    if (!isSubmitter && !isHandler && !isAdmin && caseRecord.status === "OPENED") {
      if (userRole === "DCR_HELPER") {
        isDCRHelperViewingOpen = true;
      } else {
        const viewer = await prisma.user.findUnique({
          where: { id: userId },
          select: { dcrAccess: true },
        });
        if (viewer?.dcrAccess) {
          isDCRHelperViewingOpen = true;
        }
      }
    }

    if (!isSubmitter && !isHandler && !isAdmin && !isDCRHelperViewingOpen) {
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

    // Check if this is a JOIN action
    const joinParsed = joinActionSchema.safeParse(body);
    if (joinParsed.success) {
      return handleJoinAction(userId, userRole, id);
    }

    // Otherwise, handle status transition
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { status: newStatus, details } = parsed.data;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true } },
        handler: { select: { id: true } },
      },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    const oldStatus = caseRecord.status;

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
    const isHandler = caseRecord.handlerId === userId;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    // Allow DCR_HELPER, ADMIN, SUPER_ADMIN, or any user with dcrAccess to accept cases
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
    });
    const isDCRHelper = userRole === "DCR_HELPER" || isAdmin || (userRecord?.dcrAccess === true);

    // OPENED → IN_PROGRESS: DCRHelper accepts case
    if (oldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
      if (!isDCRHelper) {
        return NextResponse.json({ error: "仅 DCRHelper 或 Admin 可接单" }, { status: 403 });
      }

      // Check concurrent limit via CaseHandler: max 5 active cases per user
      const activeCaseCount = await (prisma as unknown as { caseHandler: { count: (args: unknown) => Promise<number> } }).caseHandler.count({
        where: {
          userId,
          case_: { status: { in: ["IN_PROGRESS", "NEED_MORE_INFO"] } },
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
      const updated = await tx.case.update({
        where: { id },
        data: updateData,
        include: {
          submitter: { select: { id: true, nickname: true } },
          handler: { select: { id: true, nickname: true } },
        },
      });

      await tx.timelineEvent.create({
        data: {
          caseId: id,
          action: actionDesc,
          oldStatus,
          newStatus,
          details: details ?? null,
        },
      });

      // If accepting case (OPENED → IN_PROGRESS), create CaseHandler record + session channel
      if (oldStatus === "OPENED" && newStatus === "IN_PROGRESS") {
        await (tx as Record<string, unknown> as { caseHandler: { create: (args: unknown) => Promise<unknown> } }).caseHandler.create({
          data: { caseId: id, userId },
        });

        const anonymousId = generateAnonymousId();
        await tx.message.create({
          data: {
            content: `会话通道已建立。匿名标识: ${anonymousId}`,
            isAnonymous: true,
            senderId: userId,
            receiverId: caseRecord.submitterId,
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
    select: { dcrAccess: true },
  });
  const isDCRHelper = userRole === "DCR_HELPER" || isAdmin || (userRecord?.dcrAccess === true);

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
  const userActiveCaseCount = await (prisma as unknown as { caseHandler: { count: (args: unknown) => Promise<number> } }).caseHandler.count({
    where: {
      userId,
      case_: { status: { in: ["IN_PROGRESS", "NEED_MORE_INFO"] } },
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
  const updatedCase = await prisma.$transaction(async (tx) => {
    // Create CaseHandler record
    await (tx as Record<string, unknown> as { caseHandler: { create: (args: unknown) => Promise<unknown> } }).caseHandler.create({
      data: { caseId, userId },
    });

    // If OPENED, transition to IN_PROGRESS and set handlerId (primary handler)
    const updateData: Record<string, unknown> = {};
    if (isOpenedCase) {
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
    const actionDesc = isOpenedCase ? "DCRHelper 接单" : "DCRHelper 加入协助";
    const newStatus = isOpenedCase ? "IN_PROGRESS" : oldStatus;
    await tx.timelineEvent.create({
      data: {
        caseId,
        action: actionDesc,
        oldStatus,
        newStatus,
        details: null,
      },
    });

    // If OPENED → IN_PROGRESS, create session channel message
    if (isOpenedCase) {
      const anonymousId = generateAnonymousId();
      await tx.message.create({
        data: {
          content: `会话通道已建立。匿名标识: ${anonymousId}`,
          isAnonymous: true,
          senderId: userId,
          receiverId: caseRecord.submitterId,
          caseId,
        },
      });
    }

    return updated;
  });

  // Send notification to submitter
  if (caseRecord.submitterId !== userId) {
    const notifBody = isOpenedCase
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
    { action: "JOIN", oldStatus, newStatus: isOpenedCase ? "IN_PROGRESS" : oldStatus },
  );

  return NextResponse.json({ case: updatedCase });
}
