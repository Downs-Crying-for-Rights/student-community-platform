import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { createReportSchema, paginationSchema } from "@/lib/validators";
import { checkPostAccess } from "@/lib/post-access";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";
import { Prisma } from "@prisma/client";

const AUTO_HIDE_THRESHOLD = 3;

const listQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
});

/**
 * POST /api/reports
 * Submit a report. Any authenticated user can report content.
 * - Validates at least one target (user, post, or comment) is specified
 * - Prevents duplicate reports from the same user on the same target
 * - When 3+ users report the same content, auto-hides it and notifies Moderators
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const parsed = createReportSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const reporterId = req.user.id;
    const isPrivileged = hasMinimumRole(req.user.role, "MODERATOR");
    const targetValues = [
      data.targetUserId,
      data.targetPostId,
      data.targetCommentId,
      data.targetTaskId,
      data.targetCaseMessageId,
      data.targetHelpMessageId,
      data.targetDmMessageId,
      data.targetChatMessageId,
      data.targetChatRoomId,
    ].filter(Boolean);
    if (targetValues.length !== 1) {
      return NextResponse.json({ error: "必须且只能指定一个举报目标" }, { status: 400 });
    }

    if (data.targetUserId) {
      if (data.targetUserId === reporterId) return NextResponse.json({ error: "不能举报自己" }, { status: 400 });
      const user = await prisma.user.findUnique({ where: { id: data.targetUserId }, select: { id: true } });
      if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (data.targetPostId) {
      const post = await prisma.post.findUnique({
        where: { id: data.targetPostId },
        select: { authorId: true, status: true, visibility: true, caseId: true, author: { select: { isShadowBanned: true } }, board: { select: { zone: true } } },
      });
      if (!post) return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
      if (post.authorId === reporterId) return NextResponse.json({ error: "不能举报自己的帖子" }, { status: 400 });
      const access = await checkPostAccess(req.user, post);
      if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (data.targetCommentId) {
      const comment = await prisma.comment.findUnique({
        where: { id: data.targetCommentId },
        select: {
          authorId: true,
          isDeleted: true,
          post: { select: { authorId: true, status: true, visibility: true, caseId: true, author: { select: { isShadowBanned: true } }, board: { select: { zone: true } } } },
        },
      });
      if (!comment || comment.isDeleted) return NextResponse.json({ error: "评论不存在" }, { status: 404 });
      if (comment.authorId === reporterId) return NextResponse.json({ error: "不能举报自己的评论" }, { status: 400 });
      const access = await checkPostAccess(req.user, comment.post);
      if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (data.targetTaskId) {
      const task = await prisma.mutualAidTask.findUnique({
        where: { id: data.targetTaskId },
        select: { status: true, requesterId: true, helpSessions: { select: { helperId: true } } },
      });
      if (!task) return NextResponse.json({ error: "互助任务不存在" }, { status: 404 });
      if (task.requesterId === reporterId) return NextResponse.json({ error: "不能举报自己的任务" }, { status: 400 });
      const isParticipant = task.helpSessions.some((session) => session.helperId === reporterId);
      if (task.status !== "OPEN" && !isParticipant && !isPrivileged) {
        return NextResponse.json({ error: "无权举报此任务" }, { status: 403 });
      }
    }

    if (data.targetCaseMessageId) {
      const message = await prisma.message.findUnique({
        where: { id: data.targetCaseMessageId },
        select: {
          senderId: true,
          case_: { select: { submitterId: true, handlerId: true, handlers: { select: { userId: true } } } },
        },
      });
      if (!message) return NextResponse.json({ error: "委托消息不存在" }, { status: 404 });
      if (message.senderId === reporterId) return NextResponse.json({ error: "不能举报自己的消息" }, { status: 400 });
      const canAccess = message.case_ && (
        message.case_.submitterId === reporterId
        || message.case_.handlerId === reporterId
        || message.case_.handlers.some((handler) => handler.userId === reporterId)
      );
      if (!canAccess && !isPrivileged) return NextResponse.json({ error: "无权举报此消息" }, { status: 403 });
    }

    if (data.targetHelpMessageId) {
      const message = await prisma.helpChatMessage.findUnique({
        where: { id: data.targetHelpMessageId },
        select: { senderId: true, chat: { select: { session: { select: { requesterId: true, helperId: true } } } } },
      });
      if (!message) return NextResponse.json({ error: "互助消息不存在" }, { status: 404 });
      if (message.senderId === reporterId) return NextResponse.json({ error: "不能举报自己的消息" }, { status: 400 });
      const session = message.chat.session;
      if (session.requesterId !== reporterId && session.helperId !== reporterId && !isPrivileged) {
        return NextResponse.json({ error: "无权举报此消息" }, { status: 403 });
      }
    }

    if (data.targetDmMessageId) {
      const message = await prisma.dMMessage.findUnique({
        where: { id: data.targetDmMessageId },
        select: { senderId: true, thread: { select: { participant1Id: true, participant2Id: true } } },
      });
      if (!message) return NextResponse.json({ error: "私信不存在" }, { status: 404 });
      if (message.senderId === reporterId) return NextResponse.json({ error: "不能举报自己的消息" }, { status: 400 });
      if (message.thread.participant1Id !== reporterId && message.thread.participant2Id !== reporterId && !isPrivileged) {
        return NextResponse.json({ error: "无权举报此私信" }, { status: 403 });
      }
    }

    if (data.targetChatMessageId) {
      const message = await prisma.chatMessage.findUnique({
        where: { id: data.targetChatMessageId },
        select: { senderId: true, roomId: true },
      });
      if (!message) return NextResponse.json({ error: "群聊消息不存在" }, { status: 404 });
      if (message.senderId === reporterId) return NextResponse.json({ error: "不能举报自己的消息" }, { status: 400 });
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: message.roomId, userId: reporterId } },
        select: { id: true },
      });
      if (!membership && !isPrivileged) return NextResponse.json({ error: "无权举报此群聊消息" }, { status: 403 });
    }

    if (data.targetChatRoomId) {
      const room = await prisma.chatRoom.findUnique({
        where: { id: data.targetChatRoomId },
        select: { createdById: true, type: true, status: true },
      });
      if (!room) return NextResponse.json({ error: "群聊不存在" }, { status: 404 });
      if (room.createdById === reporterId) return NextResponse.json({ error: "不能举报自己创建的群聊" }, { status: 400 });
      if (room.type !== "PUBLIC" || room.status !== "APPROVED") {
        const membership = await prisma.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId: data.targetChatRoomId, userId: reporterId } },
          select: { id: true },
        });
        if (!membership && !isPrivileged) return NextResponse.json({ error: "无权举报此群聊" }, { status: 403 });
      }
    }

    const targetData = {
      targetUserId: data.targetUserId ?? null,
      targetPostId: data.targetPostId ?? null,
      targetCommentId: data.targetCommentId ?? null,
      targetTaskId: data.targetTaskId ?? null,
      targetCaseMessageId: data.targetCaseMessageId ?? null,
      targetHelpMessageId: data.targetHelpMessageId ?? null,
      targetDmMessageId: data.targetDmMessageId ?? null,
      targetChatMessageId: data.targetChatMessageId ?? null,
      targetChatRoomId: data.targetChatRoomId ?? null,
    };
    const targetKey = getReportTargetKey(targetData);
    const report = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", targetKey);
      const duplicate = await tx.report.findFirst({ where: { reporterId, targetKey } });
      if (duplicate) throw new Error("REPORT_DUPLICATE");
      const created = await tx.report.create({
        data: {
          reason: data.reason,
          details: data.details,
          status: "PENDING",
          reporterId,
          targetKey,
          ...targetData,
        },
      });
      await checkAutoHideThreshold(tx, targetKey, data.targetPostId, data.targetCommentId);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新举报待处理",
      text: `收到新的用户举报，举报类型：${data.reason}。`,
      actionUrl: "/admin/reports?status=PENDING",
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_DUPLICATE") {
      return NextResponse.json({ error: "您已举报过该内容" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "您已举报过该内容" }, { status: 409 });
    }
    console.error("POST /api/reports error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });


/**
 * GET /api/reports
 * Moderator+ only: list reports with optional status filter and pagination.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, status } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          reporter: { select: { id: true, nickname: true } },
          resolvedBy: { select: { id: true, nickname: true } },
          targetUser: { select: { id: true, nickname: true, role: true } },
          targetPost: { select: { id: true, title: true, status: true, authorId: true } },
          targetComment: { select: { id: true, content: true, isDeleted: true, authorId: true } },
          targetTask: { select: { id: true, title: true, status: true } },
          targetCaseMessage: { select: { id: true, content: true, senderId: true, caseId: true } },
          targetHelpMessage: { select: { id: true, content: true, senderId: true, chat: { select: { sessionId: true } } } },
          targetDmMessage: { select: { id: true, content: true, senderId: true, threadId: true } },
          targetChatMessage: { select: { id: true, content: true, senderId: true, roomId: true } },
          targetChatRoom: { select: { id: true, name: true, description: true, status: true, createdById: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({ reports, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR", { captureAllTelemetry: true });

/**
 * Check if the same content (post or comment) has been reported by 3+ different users.
 * If so, auto-hide the content and notify all Moderators.
 */
type ReportTargetData = {
  targetUserId: string | null;
  targetPostId: string | null;
  targetCommentId: string | null;
  targetTaskId: string | null;
  targetCaseMessageId: string | null;
  targetHelpMessageId: string | null;
  targetDmMessageId: string | null;
  targetChatMessageId: string | null;
  targetChatRoomId: string | null;
};

function getReportTargetKey(target: ReportTargetData) {
  const entries = [
    ["user", target.targetUserId],
    ["post", target.targetPostId],
    ["comment", target.targetCommentId],
    ["task", target.targetTaskId],
    ["case-message", target.targetCaseMessageId],
    ["help-message", target.targetHelpMessageId],
    ["dm-message", target.targetDmMessageId],
    ["chat-message", target.targetChatMessageId],
    ["chat-room", target.targetChatRoomId],
  ] as const;
  const entry = entries.find(([, value]) => value);
  if (!entry) throw new Error("REPORT_TARGET_MISSING");
  return `${entry[0]}:${entry[1]}`;
}

async function checkAutoHideThreshold(
  tx: Prisma.TransactionClient,
  targetKey: string,
  targetPostId: string | undefined | null,
  targetCommentId: string | undefined | null,
) {
  const reportCount = await tx.report.count({
    where: { targetKey, status: { not: "DISMISSED" } },
  });
  if (reportCount < AUTO_HIDE_THRESHOLD) return;

  if (targetPostId) {
      const post = await tx.post.findUnique({
        where: { id: targetPostId },
        select: { id: true, status: true, reportAutoHidden: true, authorId: true, title: true },
      });

      if (post && post.status !== "DELETED" && !post.reportAutoHidden) {
        const hidden = await tx.post.updateMany({
          where: { id: targetPostId, status: { not: "DELETED" }, reportAutoHidden: false },
          data: { status: "DELETED", reportAutoHidden: true },
        });
        if (hidden.count !== 1) return;
        await tx.notification.createMany({
          data: [{
            userId: post.authorId,
            type: "SYSTEM",
            title: "帖子已被自动隐藏",
            content: `你的帖子「${post.title}」因收到多次举报，已暂时隐藏并进入平台审核。`,
            link: "/messages",
          }],
        });

        await notifyModerators(tx,
          `帖子 ${targetPostId} 被 ${reportCount} 人举报，已自动隐藏`,
          `/post/${targetPostId}`,
        );
    }
  }

  if (targetCommentId) {
      const comment = await tx.comment.findUnique({
        where: { id: targetCommentId },
        select: { id: true, isDeleted: true, reportAutoHidden: true, authorId: true, postId: true },
      });

      if (comment && !comment.isDeleted && !comment.reportAutoHidden) {
        const hidden = await tx.comment.updateMany({
          where: { id: targetCommentId, isDeleted: false, reportAutoHidden: false },
          data: { isDeleted: true, reportAutoHidden: true },
        });
        if (hidden.count !== 1) return;
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
        });
        await tx.notification.createMany({
          data: [{
            userId: comment.authorId,
            type: "SYSTEM",
            title: "评论已被自动隐藏",
            content: "你的评论因收到多次举报，已暂时隐藏并进入平台审核。",
            link: `/post/${comment.postId}`,
          }],
        });

        await notifyModerators(tx,
          `评论 ${targetCommentId} 被 ${reportCount} 人举报，已自动隐藏`,
          `/admin/moderation`,
        );
    }
  }
}

/**
 * Send a notification to all Moderator and Admin users.
 */
async function notifyModerators(tx: Prisma.TransactionClient, content: string, link: string) {
  const moderators = await tx.user.findMany({
    where: { role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });

  if (moderators.length > 0) {
    await tx.notification.createMany({
      data: moderators.map((mod) => ({
        type: "SYSTEM" as const,
        title: "举报自动隐藏通知",
        content,
        userId: mod.id,
        link,
      })),
    });
  }
}
