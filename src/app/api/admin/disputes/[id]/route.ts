import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { moderateDisputeSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";
import { aggregateHelpSessionStatus, restoreHelpSessionStatus } from "@/lib/task-state-machine";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";

const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/** POST /api/admin/disputes/[id] where id is the disputed HelpSession id. */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: sessionId } = context.params;
    const userId = req.user.id;
    if (!MODERATOR_ROLES.includes(req.user.role as (typeof MODERATOR_ROLES)[number])) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const parsed = moderateDisputeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { action, reason, targetUserId } = parsed.data;
    const disputed = await prisma.helpSession.findUnique({
      where: { id: sessionId },
      include: { task: { include: { helpSessions: true } }, claim: true },
    });
    if (!disputed) return NextResponse.json({ error: "争议会话不存在" }, { status: 404 });
    if (disputed.status !== "DISPUTED") {
      return NextResponse.json({ error: "该争议已被其他管理员处理" }, { status: 409 });
    }
    if (action === "ban_user" && !targetUserId) {
      return NextResponse.json({ error: "封禁操作需要选择用户" }, { status: 400 });
    }
    if (targetUserId && ![disputed.requesterId, disputed.helperId].includes(targetUserId)) {
      return NextResponse.json({ error: "只能处置该争议会话的参与者" }, { status: 400 });
    }

    const task = disputed.task;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${task.id}`}))`;
      const current = await tx.helpSession.findUnique({ where: { id: sessionId } });
      if (!current || current.status !== "DISPUTED") throw new Error("DISPUTE_ALREADY_RESOLVED");

      let sessionStatus: "CLAIMED" | "IN_PROGRESS" | "EVIDENCE_PENDING" | "COMPLETED" | "CLOSED";
      let taskStatus;
      if (action === "dismiss") {
        sessionStatus = restoreHelpSessionStatus(current.statusBeforeDispute);
        const claimed = await tx.helpSession.updateMany({
          where: { id: sessionId, status: "DISPUTED" },
          data: { status: sessionStatus, statusBeforeDispute: null },
        });
        if (claimed.count !== 1) throw new Error("DISPUTE_ALREADY_RESOLVED");
        const sessions = await tx.helpSession.findMany({ where: { taskId: task.id }, select: { status: true } });
        taskStatus = aggregateHelpSessionStatus(sessions.map((item) => item.status));
        await tx.mutualAidTask.update({ where: { id: task.id }, data: { status: taskStatus } });
      } else if (action === "replace_helper") {
        sessionStatus = "CLOSED";
        const claimed = await tx.helpSession.updateMany({
          where: { id: sessionId, status: "DISPUTED" },
          data: { status: "CLOSED", statusBeforeDispute: null, closedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("DISPUTE_ALREADY_RESOLVED");
        await tx.helpClaim.updateMany({
          where: { sessionId },
          data: { status: "CANCELLED", requesterConfirmed: false, sessionId: null },
        });
        const sessions = await tx.helpSession.findMany({ where: { taskId: task.id }, select: { status: true } });
        taskStatus = aggregateHelpSessionStatus(sessions.map((item) => item.status));
        await tx.mutualAidTask.update({ where: { id: task.id }, data: { status: taskStatus } });
      } else {
        sessionStatus = "CLOSED";
        taskStatus = "CLOSED" as const;
        const claimed = await tx.helpSession.updateMany({
          where: { id: sessionId, status: "DISPUTED" },
          data: { status: "CLOSED", statusBeforeDispute: null, closedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("DISPUTE_ALREADY_RESOLVED");
        await tx.helpSession.updateMany({
          where: { taskId: task.id, id: { not: sessionId }, status: { notIn: ["COMPLETED", "CLOSED"] } },
          data: { status: "CLOSED", statusBeforeDispute: null, closedAt: new Date() },
        });
        await tx.mutualAidTask.update({
          where: { id: task.id },
          data: { status: "CLOSED", closureReason: reason },
        });
      }

      if (action === "ban_user" && targetUserId) {
        await tx.user.update({ where: { id: targetUserId }, data: { isBanned: true } });
        await tx.userPunishment.create({
          data: {
            userId: targetUserId,
            operatorId: userId,
            type: "ACCOUNT_BAN",
            action: "APPLIED",
            reason,
            details: { sourceType: "DCR_DISPUTE", taskId: task.id, sessionId },
          },
        });
      }

      await tx.taskTimelineEvent.create({
        data: {
          taskId: task.id,
          action: `moderate_${action}`,
          oldStatus: task.status,
          newStatus: taskStatus,
          details: `[session:${sessionId}]\n${reason}`,
          operatorId: userId,
        },
      });
      await tx.moderationAction.create({
        data: {
          actionType: action.toUpperCase(),
          targetType: "HELP_SESSION",
          targetId: sessionId,
          reason,
          operatorId: userId,
          details: { taskId: task.id, targetUserId: targetUserId ?? null, sessionStatus, taskStatus },
        },
      });
      await logAudit(userId, `DISPUTE_${action.toUpperCase()}`, "TASK", task.id, {
        sessionId, reason, targetUserId: targetUserId ?? null, sessionStatus, taskStatus,
      }, undefined, tx);
      return { sessionStatus, taskStatus };
    });

    const recipients = ["takedown", "ban_user", "freeze"].includes(action)
      ? task.helpSessions.flatMap((session) => [session.requesterId, session.helperId])
      : [disputed.requesterId, disputed.helperId];
    await notifyMutualAidUsersBestEffort(recipients, {
      title: action === "dismiss" ? "互助争议已驳回，可继续处理" : "互助争议已完成仲裁",
      content: action === "dismiss"
        ? `任务「${task.title}」的会话已恢复到争议前状态。`
        : `任务「${task.title}」的争议会话已由管理员处理。`,
      link: `/dcr/tasks/${task.id}`,
    });
    return NextResponse.json({ action, sessionId, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "DISPUTE_ALREADY_RESOLVED") {
      return NextResponse.json({ error: "该争议已被其他管理员处理" }, { status: 409 });
    }
    console.error("POST /api/admin/disputes/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
