import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { aggregateHelpSessionStatus } from "@/lib/task-state-machine";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";

const decisionSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const parsed = decisionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
    }

    const claim = await prisma.helpClaim.findUnique({
      where: { id: context.params.claimId },
      include: {
        targetTask: { select: { id: true, status: true, requesterId: true } },
        offeredTask: { select: { id: true, title: true } },
      },
    });

    if (!claim) return NextResponse.json({ error: "接取申请不存在" }, { status: 404 });
    if (claim.requesterId !== req.user.id) {
      return NextResponse.json({ error: "只有委托发起人可以处理申请" }, { status: 403 });
    }
    if (claim.status !== "PENDING") {
      return NextResponse.json({ error: "该申请已处理" }, { status: 409 });
    }

    if (parsed.data.action === "reject") {
      const rejected = await prisma.helpClaim.updateMany({
        where: { id: claim.id, status: "PENDING" },
        data: { status: "REJECTED", requesterConfirmed: false },
      });
      if (rejected.count === 0) {
        return NextResponse.json({ error: "该申请已被处理" }, { status: 409 });
      }
      await logAudit(req.user.id, "TASK_CLAIM_REJECT", "TASK", claim.targetTaskId, { claimId: claim.id }, undefined, prisma);
      await notifyMutualAidUsersBestEffort([claim.applicantId], {
        title: "互助申请未通过",
        content: "你的互助申请未被委托发起人接受。",
        link: `/dcr/tasks/${claim.targetTaskId}`,
      });
      return NextResponse.json({ status: "REJECTED" });
    }

    if (!["OPEN", "CLAIMED", "IN_PROGRESS"].includes(claim.targetTask.status)) {
      return NextResponse.json({ error: "任务已进入结案流程，不能再接受申请" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${claim.targetTaskId}`}))`;
      const currentClaim = await tx.helpClaim.findUnique({
        where: { id: claim.id },
        select: { status: true, requesterId: true },
      });
      if (!currentClaim || currentClaim.status !== "PENDING") throw new Error("CLAIM_ALREADY_HANDLED");
      if (currentClaim.requesterId !== req.user.id) throw new Error("CLAIM_FORBIDDEN");
      const accepted = await tx.helpClaim.updateMany({
        where: { id: claim.id, status: "PENDING" },
        data: { status: "ACCEPTED", requesterConfirmed: true },
      });
      if (accepted.count === 0) throw new Error("CLAIM_ALREADY_HANDLED");

      const session = await tx.helpSession.create({
        data: {
          taskId: claim.targetTaskId,
          helperId: claim.applicantId,
          requesterId: claim.requesterId,
          helpChat: { create: {} },
          evidenceRoom: { create: {} },
        },
        include: { helpChat: true, evidenceRoom: true },
      });

      const systemMessage = claim.offeredTask
        ? `双方已同意进入互助流程。互助人同时发送了自己的委托《${claim.offeredTask.title}》，请彼此查看并确认互助安排。`
        : "双方已同意进入互助流程。互助人选择无偿帮助，未附带自己的委托。";

      await tx.helpChatMessage.create({
        data: {
          chatId: session.helpChat!.id,
          content: systemMessage,
          isSystemMessage: true,
          senderId: claim.applicantId,
        },
      });

      await tx.helpClaim.update({
        where: { id: claim.id },
        data: { sessionId: session.id },
      });

      const sessions = await tx.helpSession.findMany({ where: { taskId: claim.targetTaskId }, select: { status: true } });
      const nextStatus = aggregateHelpSessionStatus(sessions.map((item) => item.status));
      await tx.mutualAidTask.updateMany({ where: { id: claim.targetTaskId }, data: { status: nextStatus } });

      await tx.taskTimelineEvent.create({
        data: {
          taskId: claim.targetTaskId,
          action: "claim_accepted",
          oldStatus: currentTask.status,
          newStatus: nextStatus,
          details: claim.offeredTask
            ? `双方确认，已交换委托 ${claim.offeredTask.id}`
            : "双方确认，互助人以无偿帮助方式加入",
          operatorId: req.user.id,
        },
      });

      await tx.user.updateMany({
        where: { id: { in: [claim.applicantId, claim.requesterId] } },
        data: { dcrHelperAccess: true },
      });

      await logAudit(req.user.id, "TASK_CLAIM_ACCEPT", "TASK", claim.targetTaskId, {
        claimId: claim.id,
        offeredTaskId: claim.offeredTaskId,
        sessionId: session.id,
      }, undefined, tx);

      return { sessionId: session.id, chatId: session.helpChat!.id, evidenceRoomId: session.evidenceRoom!.id };
    });

    await notifyMutualAidUsersBestEffort([claim.applicantId], {
      title: "互助申请已通过",
      content: "你的互助申请已通过，可以进入互助会话。",
      link: `/dcr/tasks/${claim.targetTaskId}`,
    });

    return NextResponse.json({ status: "ACCEPTED", ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "CLAIM_ALREADY_HANDLED") {
      return NextResponse.json({ error: "该申请已被处理" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TASK_NO_LONGER_ACCEPTS_CLAIMS") {
      return NextResponse.json({ error: "任务已进入结案流程，不能再接受申请" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "CLAIM_FORBIDDEN") {
      return NextResponse.json({ error: "只有委托发起人可以处理申请" }, { status: 403 });
    }
    console.error("POST /api/dcr/claims/[claimId] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
