import { NextResponse } from "next/server";
import type { ReportResolutionAction, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, isAdminRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED", "DISMISSED"],
};

const actionSchema = z.enum([
  "NONE",
  "DELETE_TARGET",
  "BAN_RESPONSIBLE_USER",
  "SHADOW_HIDE_RESPONSIBLE_USER",
  "DELETE_TARGET_AND_BAN_USER",
  "DELETE_TARGET_AND_SHADOW_HIDE_USER",
]);

const updateReportSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RESOLVED", "DISMISSED"]),
  resolution: z.string().trim().min(1).max(2000).optional(),
  action: actionSchema.optional(),
}).strict();

const REPORT_TARGET = {
  targetUser: { select: { id: true, role: true } },
  targetPost: { select: { id: true, authorId: true, status: true } },
  targetComment: { select: { id: true, authorId: true, postId: true, isDeleted: true } },
  targetTask: { select: { id: true, requesterId: true } },
  targetCaseMessage: { select: { id: true, senderId: true } },
  targetHelpMessage: { select: { id: true, senderId: true } },
  targetDmMessage: { select: { id: true, senderId: true } },
  targetChatMessage: { select: { id: true, senderId: true } },
  targetChatRoom: { select: { id: true, createdById: true } },
} as const;

function responsibleUserId(report: Awaited<ReturnType<typeof loadReport>>) {
  if (!report) return null;
  return report.targetUser?.id
    ?? report.targetPost?.authorId
    ?? report.targetComment?.authorId
    ?? report.targetTask?.requesterId
    ?? report.targetCaseMessage?.senderId
    ?? report.targetHelpMessage?.senderId
    ?? report.targetDmMessage?.senderId
    ?? report.targetChatMessage?.senderId
    ?? report.targetChatRoom?.createdById
    ?? null;
}

function actionDeletesTarget(action: ReportResolutionAction) {
  return action === "DELETE_TARGET"
    || action === "DELETE_TARGET_AND_BAN_USER"
    || action === "DELETE_TARGET_AND_SHADOW_HIDE_USER";
}

function actionBansUser(action: ReportResolutionAction) {
  return action === "BAN_RESPONSIBLE_USER" || action === "DELETE_TARGET_AND_BAN_USER";
}

function actionShadowHidesUser(action: ReportResolutionAction) {
  return action === "SHADOW_HIDE_RESPONSIBLE_USER" || action === "DELETE_TARGET_AND_SHADOW_HIDE_USER";
}

function actionLabel(action: ReportResolutionAction) {
  const labels: Record<ReportResolutionAction, string> = {
    NONE: "记录处理结论",
    DELETE_TARGET: "删除被举报内容",
    BAN_RESPONSIBLE_USER: "封禁责任用户",
    SHADOW_HIDE_RESPONSIBLE_USER: "隐藏责任用户的帖子",
    DELETE_TARGET_AND_BAN_USER: "删除内容并封禁责任用户",
    DELETE_TARGET_AND_SHADOW_HIDE_USER: "删除内容并隐藏责任用户帖子",
  };
  return labels[action];
}

async function loadReport(client: typeof prisma, id: string) {
  return client.report.findUnique({
    where: { id },
    include: REPORT_TARGET,
  });
}

export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = context.params;
    const parsed = updateReportSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { status: newStatus, resolution } = parsed.data;
    const requestedAction = parsed.data.action as ReportResolutionAction | undefined;

    if ((newStatus === "RESOLVED" || newStatus === "DISMISSED") && !resolution) {
      return NextResponse.json({ error: "完成处理前必须填写处理结论" }, { status: 400 });
    }
    if (newStatus === "DISMISSED" && requestedAction !== undefined && requestedAction !== "NONE") {
      return NextResponse.json({ error: "驳回举报时不能执行处罚动作" }, { status: 400 });
    }
    if (newStatus === "IN_PROGRESS" && parsed.data.action !== undefined) {
      return NextResponse.json({ error: "接手举报时不能提前执行处罚动作" }, { status: 400 });
    }
    if (requestedAction && (actionBansUser(requestedAction) || actionShadowHidesUser(requestedAction)) && !isAdminRole(req.user.role)) {
      return NextResponse.json({ error: "封禁和影子隐藏仅限管理员执行" }, { status: 403 });
    }

    const existing = await loadReport(prisma, id);
    if (!existing) return NextResponse.json({ error: "举报不存在" }, { status: 404 });
    const allowedTransitions = VALID_TRANSITIONS[existing.status];
    if (!allowedTransitions?.includes(newStatus)) {
      return NextResponse.json({ error: "无效的状态流转", detail: `不能从 ${existing.status} 转换到 ${newStatus}` }, { status: 400 });
    }

    const action = (newStatus === "RESOLVED"
      ? requestedAction ?? (existing.targetPost || existing.targetComment ? "DELETE_TARGET" : "NONE")
      : "NONE") as ReportResolutionAction;

    const responsibleId = responsibleUserId(existing);
    if (actionDeletesTarget(action) && !existing.targetPost && !existing.targetComment) {
      return NextResponse.json({ error: "该举报目标不支持直接删除，请选择其他处置" }, { status: 400 });
    }
    if ((actionBansUser(action) || actionShadowHidesUser(action)) && !responsibleId) {
      return NextResponse.json({ error: "无法确定责任用户" }, { status: 400 });
    }
    if ((actionBansUser(action) || actionShadowHidesUser(action)) && responsibleId === req.user.id) {
      return NextResponse.json({ error: "不能处罚自己" }, { status: 400 });
    }
    if (actionBansUser(action) || actionShadowHidesUser(action)) {
      const responsible = await prisma.user.findUnique({ where: { id: responsibleId! }, select: { role: true } });
      if (!responsible) return NextResponse.json({ error: "责任用户不存在" }, { status: 404 });
      if (req.user.role !== "SUPER_ADMIN" && isAdminRole(responsible.role)) {
        return NextResponse.json({ error: "只有超级管理员可以处罚管理员" }, { status: 403 });
      }
    }

    const report = await prisma.$transaction(async (tx) => {
      const claimed = await tx.report.updateMany({
        where: { id, status: existing.status },
        data: { status: newStatus },
      });
      if (claimed.count !== 1) throw new Error("REPORT_ALREADY_HANDLED");

      if (actionDeletesTarget(action) && existing.targetPost && existing.targetPost.status !== "DELETED") {
        await tx.post.update({ where: { id: existing.targetPost.id }, data: { status: "DELETED" } });
        await tx.postRevision.updateMany({
          where: { postId: existing.targetPost.id, status: "PENDING" },
          data: { status: "SUPERSEDED", reviewedAt: new Date() },
        });
      }
      if (actionDeletesTarget(action) && existing.targetComment && !existing.targetComment.isDeleted) {
        await tx.comment.update({ where: { id: existing.targetComment.id }, data: { isDeleted: true } });
        await tx.post.update({ where: { id: existing.targetComment.postId }, data: { commentCount: { decrement: 1 } } });
      }
      if (responsibleId && (actionBansUser(action) || actionShadowHidesUser(action))) {
        const punishmentType = actionBansUser(action) ? "ACCOUNT_BAN" : "POST_SHADOW_HIDE";
        await tx.user.update({
          where: { id: responsibleId },
          data: actionBansUser(action)
            ? { isBanned: true, securityVersion: { increment: 1 } }
            : { isShadowBanned: true },
        });
        await tx.userPunishment.create({
          data: {
            userId: responsibleId,
            operatorId: req.user.id,
            type: punishmentType,
            action: "APPLIED",
            reason: resolution!,
            details: { sourceType: "REPORT", reportId: id },
          },
        });
      }

      const updated = await tx.report.update({
        where: { id },
        data: {
          status: newStatus,
          ...(resolution !== undefined ? { resolution } : {}),
          ...(newStatus === "RESOLVED" || newStatus === "DISMISSED" ? {
            resolutionAction: newStatus === "DISMISSED" ? "NONE" : action,
            resolvedAt: new Date(),
            resolvedById: req.user.id,
          } : {}),
        },
      });

      if (newStatus === "RESOLVED" || newStatus === "DISMISSED") {
        await tx.notification.create({
          data: {
            userId: existing.reporterId,
            type: "REPORT_RESULT",
            title: newStatus === "RESOLVED" ? "举报已处理" : "举报未予支持",
            content: newStatus === "RESOLVED"
              ? `处理结论：${resolution}。平台处置：${actionLabel(action)}`
              : `审核结论：${resolution}`,
            link: "/messages",
          },
        });
        if (responsibleId && responsibleId !== existing.reporterId && action !== "NONE") {
          await tx.notification.create({
            data: {
              userId: responsibleId,
              type: "SYSTEM",
              title: "平台处置通知",
              content: `平台已根据社区规范处理相关内容。处理结论：${resolution}`,
              link: "/messages",
            },
          });
        }
      }

      await logAudit(
        req.user.id,
        newStatus === "IN_PROGRESS" ? AuditAction.REPORT_CLAIM : newStatus === "DISMISSED" ? AuditAction.REPORT_DISMISS : AuditAction.REPORT_RESOLVE,
        AuditTargetType.REPORT,
        id,
        { previousStatus: existing.status, newStatus, resolution: resolution ?? null, action },
        undefined,
        tx,
      );
      return updated;
    });

    return NextResponse.json({ report, action });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_ALREADY_HANDLED") {
      return NextResponse.json({ error: "该举报已被其他管理员处理，请刷新列表" }, { status: 409 });
    }
    console.error("PATCH /api/reports/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR", { captureAllTelemetry: true });
