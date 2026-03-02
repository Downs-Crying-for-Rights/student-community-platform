import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { taskActionSchema } from "@/lib/validators";
import { canTransition, type TaskStatus } from "@/lib/task-state-machine";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/dcr/tasks/[id]
 * Return task details with timeline, requester info, and help session.
 * - Requires auth
 *
 * Validates: Requirements 1.7, 8.1, 8.2, 8.3
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      include: {
        timeline: { orderBy: { createdAt: "asc" } },
        requester: { select: { id: true, nickname: true, avatar: true } },
        helpSession: {
          select: {
            id: true,
            helperId: true,
            helpChat: { select: { id: true } },
            evidenceRoom: { select: { id: true } },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/** Roles allowed to perform moderation actions (review/approve/reject) */
const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * PATCH /api/dcr/tasks/[id]
 * Update task status via action-based transitions.
 * - Requires auth
 * - Validates body with taskActionSchema
 * - Uses canTransition to verify state transition legality
 * - Records timeline event in a transaction
 * - Logs audit
 *
 * Actions:
 *   submit  — only task creator, DRAFT → SUBMITTED
 *   review  — only Moderator/Admin, SUBMITTED → UNDER_REVIEW
 *   approve — only Moderator/Admin, UNDER_REVIEW → OPEN
 *   reject  — only Moderator/Admin, any → REJECTED (reason required)
 *
 * Validates: Requirements 1.7, 2.2, 2.3, 2.4, 2.9, 8.1, 8.2, 8.3
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const body = await req.json();
    const parsed = taskActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;

    // Find the task
    const task = await prisma.mutualAidTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    let targetStatus: string;

    switch (action) {
      case "submit": {
        // Only the task creator can submit
        if (task.requesterId !== userId) {
          return NextResponse.json({ error: "仅任务创建者可提交" }, { status: 403 });
        }
        targetStatus = "SUBMITTED";
        break;
      }
      case "review": {
        if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
          return NextResponse.json({ error: "权限不足" }, { status: 403 });
        }
        targetStatus = "UNDER_REVIEW";
        break;
      }
      case "approve": {
        if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
          return NextResponse.json({ error: "权限不足" }, { status: 403 });
        }
        targetStatus = "OPEN";
        break;
      }
      case "reject": {
        if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
          return NextResponse.json({ error: "权限不足" }, { status: 403 });
        }
        if (!reason) {
          return NextResponse.json({ error: "拒绝操作必须提供原因" }, { status: 400 });
        }
        targetStatus = "REJECTED";
        break;
      }
      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    // Verify state transition legality
    if (!canTransition(task.status as TaskStatus, targetStatus as TaskStatus)) {
      return NextResponse.json(
        { error: `不允许从 ${task.status} 转移到 ${targetStatus}` },
        { status: 400 },
      );
    }

    // Update task status + create timeline event in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.mutualAidTask.update({
        where: { id },
        data: {
          status: targetStatus as TaskStatus,
          ...(action === "reject" ? { rejectionReason: reason } : {}),
        },
      });

      await tx.taskTimelineEvent.create({
        data: {
          taskId: id,
          action,
          oldStatus: task.status,
          newStatus: targetStatus,
          details: reason ?? null,
          operatorId: userId,
        },
      });

      return updatedTask;
    });

    // Audit log
    await logAudit(userId, `TASK_${action.toUpperCase()}`, "TASK", id, {
      oldStatus: task.status,
      newStatus: targetStatus,
      reason: reason ?? null,
    });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    console.error("PATCH /api/dcr/tasks/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
