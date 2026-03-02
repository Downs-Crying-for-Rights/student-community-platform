import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { createReportSchema, paginationSchema } from "@/lib/validators";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

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
    const body = await req.json();
    const parsed = createReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { reason, details, targetUserId, targetPostId, targetCommentId } = parsed.data;
    const reporterId = req.user.id;

    // Must specify at least one target
    if (!targetUserId && !targetPostId && !targetCommentId) {
      return NextResponse.json(
        { error: "必须指定举报目标（用户、帖子或评论）" },
        { status: 400 },
      );
    }

    // Prevent self-reporting
    if (targetUserId === reporterId) {
      return NextResponse.json(
        { error: "不能举报自己" },
        { status: 400 },
      );
    }

    // Check for duplicate report from same user on same target
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId,
        targetUserId: targetUserId ?? null,
        targetPostId: targetPostId ?? null,
        targetCommentId: targetCommentId ?? null,
      },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "您已举报过该内容" },
        { status: 409 },
      );
    }

    const report = await prisma.report.create({
      data: {
        reason,
        details,
        status: "PENDING",
        reporterId,
        targetUserId: targetUserId ?? null,
        targetPostId: targetPostId ?? null,
        targetCommentId: targetCommentId ?? null,
      },
    });

    // Check auto-hide threshold for posts and comments
    await checkAutoHideThreshold(targetPostId, targetCommentId);

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


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
          targetUser: { select: { id: true, nickname: true } },
          targetPost: { select: { id: true, title: true, status: true } },
          targetComment: { select: { id: true, content: true, isDeleted: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({ reports, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");

/**
 * Check if the same content (post or comment) has been reported by 3+ different users.
 * If so, auto-hide the content and notify all Moderators.
 */
async function checkAutoHideThreshold(
  targetPostId: string | undefined | null,
  targetCommentId: string | undefined | null,
) {
  if (targetPostId) {
    const reportCount = await prisma.report.count({
      where: { targetPostId },
    });

    if (reportCount >= AUTO_HIDE_THRESHOLD) {
      // Check if post is not already hidden/deleted
      const post = await prisma.post.findUnique({
        where: { id: targetPostId },
        select: { id: true, status: true },
      });

      if (post && post.status !== "DELETED") {
        await prisma.post.update({
          where: { id: targetPostId },
          data: { status: "DELETED" },
        });

        await notifyModerators(
          `帖子 ${targetPostId} 被 ${reportCount} 人举报，已自动隐藏`,
          `/post/${targetPostId}`,
        );
      }
    }
  }

  if (targetCommentId) {
    const reportCount = await prisma.report.count({
      where: { targetCommentId },
    });

    if (reportCount >= AUTO_HIDE_THRESHOLD) {
      const comment = await prisma.comment.findUnique({
        where: { id: targetCommentId },
        select: { id: true, isDeleted: true },
      });

      if (comment && !comment.isDeleted) {
        await prisma.comment.update({
          where: { id: targetCommentId },
          data: { isDeleted: true },
        });

        await notifyModerators(
          `评论 ${targetCommentId} 被 ${reportCount} 人举报，已自动隐藏`,
          `/moderation`,
        );
      }
    }
  }
}

/**
 * Send a notification to all Moderator and Admin users.
 */
async function notifyModerators(content: string, link: string) {
  const moderators = await prisma.user.findMany({
    where: { role: { in: ["MODERATOR", "ADMIN"] } },
    select: { id: true },
  });

  if (moderators.length > 0) {
    await prisma.notification.createMany({
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
