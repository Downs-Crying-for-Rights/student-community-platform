import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { Prisma } from "@prisma/client";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";
import { canUseDcrWorkspace } from "@/lib/dcr-capabilities";

const claimSchema = z.object({
  offeredTaskId: z.string().cuid().nullable().optional(),
});

/**
 * POST /api/dcr/tasks/[id]/claim
 * Claim an OPEN mutual aid task.
 * - Requires auth + dcrAccess
 * - Verifies task is OPEN and requester is not the claimer
 * - Uses Prisma transaction with optimistic lock (where status: OPEN) for mutual exclusion
 * - Creates HelpSession, HelpChat (with system privacy prompt), EvidenceRoom, and timeline event
 * - Returns sessionId, chatId, evidenceRoomId
 *
 * Validates: Requirements 2.5, 2.6, 3.1, 3.2, 3.3, 4.1
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    // Check dcrAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true, dcrPledgeSigned: true },
    });

    if (!user || !canUseDcrWorkspace({ ...user, role: req.user.role })) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    const rateLimited = await enforceRateLimit(`dcr-task-claim:${userId}`, 10, 60_000);
    if (rateLimited) return rateLimited.response as unknown as NextResponse;

    const body = await req.json().catch(() => ({}));
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
    }

    const task = await prisma.mutualAidTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (!["OPEN", "CLAIMED", "IN_PROGRESS"].includes(task.status)) {
      return NextResponse.json({ error: "任务当前状态不可领取" }, { status: 400 });
    }

    if (task.requesterId === userId) {
      return NextResponse.json({ error: "不能领取自己发起的任务" }, { status: 400 });
    }

    const isGoodSamaritan = parsed.data.offeredTaskId === null;
    const offeredTask = parsed.data.offeredTaskId
      ? await prisma.mutualAidTask.findFirst({
          where: {
            id: parsed.data.offeredTaskId,
            requesterId: userId,
            status: { in: ["OPEN", "CLAIMED", "IN_PROGRESS"] },
          },
          select: { id: true, title: true, status: true },
        })
      : isGoodSamaritan
        ? null
        : await prisma.mutualAidTask.findFirst({
          where: {
            requesterId: userId,
            id: { not: id },
            status: { in: ["OPEN", "CLAIMED", "IN_PROGRESS"] },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, status: true },
        });

    if (parsed.data.offeredTaskId && !offeredTask) {
      return NextResponse.json({ error: "所选委托不存在、已关闭或不属于你" }, { status: 400 });
    }

    const existingClaim = await prisma.helpClaim.findUnique({
      where: { targetTaskId_applicantId: { targetTaskId: id, applicantId: userId } },
      select: { id: true, status: true, sessionId: true },
    });
    if (existingClaim?.status === "ACCEPTED") {
      return NextResponse.json(
        { error: "你已与该委托建立互助关系", claim: existingClaim },
        { status: 409 },
      );
    }
    const replacedSession = await prisma.helpSession.findFirst({
      where: { taskId: id, helperId: userId, status: "CLOSED" },
      select: { id: true },
    });
    if (replacedSession) {
      return NextResponse.json({ error: "该互助关系已由管理员终止，不能重新申请" }, { status: 409 });
    }

    const claim = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${id}`}))`;
      const currentTask = await tx.mutualAidTask.findUnique({
        where: { id },
        select: { requesterId: true, status: true },
      });
      if (!currentTask || !["OPEN", "CLAIMED", "IN_PROGRESS"].includes(currentTask.status)) {
        throw new Error("TASK_NO_LONGER_ACCEPTS_CLAIMS");
      }
      if (currentTask.requesterId === userId) throw new Error("CANNOT_CLAIM_OWN_TASK");

      const currentExistingClaim = await tx.helpClaim.findUnique({
        where: { targetTaskId_applicantId: { targetTaskId: id, applicantId: userId } },
        select: { id: true, status: true },
      });
      let result: { id: string; status: string; offeredTaskId: string | null };
      if (currentExistingClaim) {
        const updated = await tx.helpClaim.updateMany({
          where: { id: currentExistingClaim.id, status: { not: "ACCEPTED" } },
          data: {
            offeredTaskId: offeredTask?.id ?? null,
            status: "PENDING",
            applicantConfirmed: true,
            requesterConfirmed: false,
            sessionId: null,
          },
        });
        if (updated.count === 0) throw new Error("CLAIM_ALREADY_ACCEPTED");
        result = (await tx.helpClaim.findUnique({
          where: { id: currentExistingClaim.id },
          select: { id: true, status: true, offeredTaskId: true },
        }))!;
      } else {
        result = await tx.helpClaim.create({
          data: {
            targetTaskId: id,
            offeredTaskId: offeredTask?.id ?? null,
            applicantId: userId,
            requesterId: currentTask.requesterId,
          },
          select: { id: true, status: true, offeredTaskId: true },
        });
      }
      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action: "claim_requested",
          oldStatus: currentTask.status,
          newStatus: currentTask.status,
          details: offeredTask ? `已交换委托：${offeredTask.title}` : "互助人选择无偿帮助，未附带自己的委托",
          operatorId: userId,
        },
      });
      return result;
    });

    await logAudit(userId, "TASK_CLAIM_REQUEST", "TASK", id, {
      claimId: claim.id,
      offeredTaskId: offeredTask?.id ?? null,
      mode: offeredTask ? "TASK_EXCHANGE" : "GOOD_SAMARITAN",
    }, undefined, prisma);
    await notifyMutualAidUsersBestEffort([task.requesterId], {
      title: "收到新的互助申请",
      content: `互助任务「${task.title}」收到新的互助申请。`,
      link: `/dcr/tasks/${id}`,
    });

    return NextResponse.json({
      claim,
      message: offeredTask
        ? "接取申请已发送，等待对方同意"
        : "无偿帮助申请已发送，等待对方同意",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CLAIM_ALREADY_ACCEPTED") {
      return NextResponse.json({ error: "该互助关系已建立，不能重复申请" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TASK_NO_LONGER_ACCEPTS_CLAIMS") {
      return NextResponse.json({ error: "任务已进入结案流程，不能再申请" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "CANNOT_CLAIM_OWN_TASK") {
      return NextResponse.json({ error: "不能领取自己发起的任务" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "该委托的接取申请已存在" }, { status: 409 });
    }
    console.error("POST /api/dcr/tasks/[id]/claim error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
