import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { moderateDisputeSchema } from "@/lib/validators";
import { logAudit } from "@/lib/audit";

const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * POST /api/admin/disputes/[id]
 * Moderate a disputed mutual-aid task.
 *
 * Supported actions:
 * - takedown:       Close the task, record reason.
 * - replace_helper: Re-open the task for a new helper, delete helpSession.
 * - ban_user:       Ban the targetUserId, close the task, deduct -20 reputation.
 * - dismiss:        Dismiss the dispute, revert status to EVIDENCE_PENDING.
 * - freeze:         Close the task, record reason.
 *
 * Creates a ModerationAction record and a TaskTimelineEvent for every action.
 *
 * Validates: Requirements 6.5, 6.6, 11.2
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = await context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Role check
    if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = moderateDisputeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { action, reason, targetUserId } = parsed.data;

    // Load the task
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id },
      include: { helpSession: true },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (task.status !== "DISPUTED") {
      return NextResponse.json(
        { error: "仅 DISPUTED 状态的任务可进行仲裁" },
        { status: 400 },
      );
    }

    let newStatus: string;

    switch (action) {
      case "takedown": {
        // Close the task with reason
        newStatus = "CLOSED";
        await prisma.$transaction(async (tx) => {
          await (tx as any).mutualAidTask.update({
            where: { id },
            data: { status: newStatus, closureReason: reason },
          });
          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "moderate_takedown",
              oldStatus: "DISPUTED",
              newStatus,
              details: reason,
              operatorId: userId,
            },
          });
          await (tx as any).moderationAction.create({
            data: {
              actionType: "TAKEDOWN",
              targetType: "TASK",
              targetId: id,
              reason,
              operatorId: userId,
            },
          });
        });
        break;
      }

      case "replace_helper": {
        // Re-open the task for a new helper, delete helpSession cascade
        newStatus = "OPEN";
        await prisma.$transaction(async (tx) => {
          // Delete helpSession (cascades to HelpChat, EvidenceRoom)
          if (task.helpSession) {
            await (tx as any).helpSession.delete({
              where: { id: task.helpSession.id },
            });
          }
          await (tx as any).mutualAidTask.update({
            where: { id },
            data: {
              status: newStatus,
              requesterConfirmed: false,
              helperConfirmed: false,
            },
          });
          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "moderate_replace_helper",
              oldStatus: "DISPUTED",
              newStatus,
              details: reason,
              operatorId: userId,
            },
          });
          await (tx as any).moderationAction.create({
            data: {
              actionType: "REPLACE_HELPER",
              targetType: "TASK",
              targetId: id,
              reason,
              operatorId: userId,
            },
          });
        });
        break;
      }

      case "ban_user": {
        // Ban the target user, close the task, deduct reputation
        if (!targetUserId) {
          return NextResponse.json(
            { error: "ban_user 操作需要提供 targetUserId" },
            { status: 400 },
          );
        }

        newStatus = "CLOSED";
        await prisma.$transaction(async (tx) => {
          // Ban the user
          await tx.user.update({
            where: { id: targetUserId },
            data: { isBanned: true },
          });
          // Deduct reputation -20
          await tx.user.update({
            where: { id: targetUserId },
            data: { reputationScore: { decrement: 20 } },
          });
          // Close the task
          await (tx as any).mutualAidTask.update({
            where: { id },
            data: { status: newStatus, closureReason: reason },
          });
          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "moderate_ban_user",
              oldStatus: "DISPUTED",
              newStatus,
              details: `封禁用户 ${targetUserId}：${reason}`,
              operatorId: userId,
            },
          });
          await (tx as any).moderationAction.create({
            data: {
              actionType: "BAN_USER",
              targetType: "TASK",
              targetId: id,
              reason,
              operatorId: userId,
              details: { targetUserId },
            },
          });
        });
        break;
      }

      case "dismiss": {
        // Dismiss the dispute, revert to EVIDENCE_PENDING
        newStatus = "EVIDENCE_PENDING";
        await prisma.$transaction(async (tx) => {
          await (tx as any).mutualAidTask.update({
            where: { id },
            data: { status: newStatus },
          });
          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "moderate_dismiss",
              oldStatus: "DISPUTED",
              newStatus,
              details: reason,
              operatorId: userId,
            },
          });
          await (tx as any).moderationAction.create({
            data: {
              actionType: "DISMISS_DISPUTE",
              targetType: "TASK",
              targetId: id,
              reason,
              operatorId: userId,
            },
          });
        });
        break;
      }

      case "freeze": {
        // Freeze/close the task with reason
        newStatus = "CLOSED";
        await prisma.$transaction(async (tx) => {
          await (tx as any).mutualAidTask.update({
            where: { id },
            data: { status: newStatus, closureReason: reason },
          });
          await (tx as any).taskTimelineEvent.create({
            data: {
              taskId: id,
              action: "moderate_freeze",
              oldStatus: "DISPUTED",
              newStatus,
              details: reason,
              operatorId: userId,
            },
          });
          await (tx as any).moderationAction.create({
            data: {
              actionType: "FREEZE",
              targetType: "TASK",
              targetId: id,
              reason,
              operatorId: userId,
            },
          });
        });
        break;
      }

      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    await logAudit(userId, `DISPUTE_${action.toUpperCase()}`, "TASK", id, {
      action,
      reason,
      targetUserId: targetUserId ?? null,
      newStatus,
    });

    return NextResponse.json({ status: newStatus, action });
  } catch (error) {
    console.error("POST /api/admin/disputes/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
