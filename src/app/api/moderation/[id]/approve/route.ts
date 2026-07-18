import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { sendUserMail } from "@/lib/mail";

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
      select: { id: true, status: true, title: true, content: true, authorId: true, updatedAt: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }
    if (post.status === "DELETED") {
      return NextResponse.json({ error: "已删除的帖子不能通过审核" }, { status: 400 });
    }

    const revision = await prisma.postRevision.findFirst({
      where: { postId: id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    if (post.status !== "PENDING" && !revision) {
      return NextResponse.json(
        { error: "只能审核待审核状态的帖子", detail: `当前状态: ${post.status}` },
        { status: 400 },
      );
    }

    if (revision && revision.baseUpdatedAt.getTime() !== post.updatedAt.getTime()) {
      return NextResponse.json(
        { error: "公开版本已发生变化，请作者基于最新版本重新提交" },
        { status: 409 },
      );
    }

    const updatedPost = await prisma.$transaction(async (tx) => {
      if (!revision) {
        const updated = await tx.post.update({ where: { id }, data: { status: "PUBLISHED" } });
        await logAudit(req.user.id, AuditAction.CONTENT_APPROVE, AuditTargetType.POST, id, {
          previousStatus: "PENDING", newStatus: "PUBLISHED", title: post.title,
        }, undefined, tx);
        return updated;
      }

      await tx.postEditHistory.create({
        data: { postId: id, oldTitle: post.title, oldContent: post.content },
      });
      await tx.postTag.deleteMany({ where: { postId: id } });
      if (revision.tagIds.length > 0) {
        await tx.postTag.createMany({ data: revision.tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
      const updated = await tx.post.update({
        where: { id },
        data: {
          title: revision.title,
          content: revision.content,
          summary: revision.summary,
          images: revision.images,
          visibility: revision.visibility,
          status: "PUBLISHED",
        },
      });
      await tx.postRevision.update({
        where: { id: revision.id },
        data: { status: "APPROVED", reviewerId: req.user.id, reviewedAt: new Date() },
      });
      await logAudit(req.user.id, AuditAction.POST_REVISION_APPROVE, AuditTargetType.POST, id, {
        revisionId: revision.id,
      }, undefined, tx);
      return updated;
    });

    // Create notification for the post author
    await prisma.notification.create({
      data: {
        type: "SYSTEM",
        title: "帖子审核通过",
        content: revision ? `您的帖子「${post.title}」修改版本已通过审核并生效` : `您的帖子「${post.title}」已通过审核并发布`,
        userId: post.authorId,
        link: `/post/${post.id}`,
      },
    });
    await sendUserMail({
      userId: post.authorId,
      subject: "帖子审核通过",
      text: `您的帖子「${post.title}」已通过审核并发布。\n\n查看帖子：${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/post/${post.id}`,
    });

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    console.error("POST /api/moderation/[id]/approve error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
