import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

/**
 * POST /api/moderation/[id]/approve
 * Moderator+ only: approve a PENDING post, changing its status to PUBLISHED.
 * - Creates a notification for the post author
 * - Records the action to AuditLog
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = context.params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status !== "PENDING") {
      return NextResponse.json(
        { error: "只能审核待审核状态的帖子", detail: `当前状态: ${post.status}` },
        { status: 400 },
      );
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: { status: "PUBLISHED" },
    });

    // Create notification for the post author
    await prisma.notification.create({
      data: {
        type: "SYSTEM",
        title: "帖子审核通过",
        content: `您的帖子「${post.title}」已通过审核并发布`,
        userId: post.authorId,
        link: `/post/${post.id}`,
      },
    });

    // Record to AuditLog
    await logAudit(
      req.user.id,
      AuditAction.CONTENT_APPROVE,
      AuditTargetType.POST,
      id,
      { previousStatus: "PENDING", newStatus: "PUBLISHED", title: post.title },
    );

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    console.error("POST /api/moderation/[id]/approve error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
