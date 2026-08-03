import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { sendUserMail } from "@/lib/mail";

class ModerationConflictError extends Error {
  constructor(message = "内容已被其他审核员处理，请刷新审核队列") {
    super(message);
    this.name = "ModerationConflictError";
  }
}

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
        const claimed = await tx.post.updateMany({
          where: { id, status: "PENDING" },
          data: { status: "PUBLISHED" },
        });
        if (claimed.count !== 1) throw new ModerationConflictError();
        await logAudit(req.user.id, AuditAction.CONTENT_APPROVE, AuditTargetType.POST, id, {
          previousStatus: "PENDING", newStatus: "PUBLISHED", title: post.title,
        }, undefined, tx);
        return { ...post, status: "PUBLISHED" as const };
      }

      const claimedRevision = await tx.postRevision.updateMany({
        where: { id: revision.id, status: "PENDING" },
        data: { status: "APPROVED", reviewerId: req.user.id, reviewedAt: new Date() },
      });
      if (claimedRevision.count !== 1) throw new ModerationConflictError();

      const claimedPost = await tx.post.updateMany({
        where: { id, updatedAt: revision.baseUpdatedAt, status: { not: "DELETED" } },
        data: {
          title: revision.title,
          content: revision.content,
          summary: revision.summary,
          images: revision.images,
          visibility: revision.visibility,
          status: "PUBLISHED",
        },
      });
      if (claimedPost.count !== 1) {
        throw new ModerationConflictError("公开版本已发生变化，请作者基于最新版本重新提交");
      }

      await tx.postEditHistory.create({
        data: { postId: id, oldTitle: post.title, oldContent: post.content },
      });
      await tx.postTag.deleteMany({ where: { postId: id } });
      if (revision.tagIds.length > 0) {
        await tx.postTag.createMany({ data: revision.tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
      await logAudit(req.user.id, AuditAction.POST_REVISION_APPROVE, AuditTargetType.POST, id, {
        revisionId: revision.id,
      }, undefined, tx);
      return {
        ...post,
        title: revision.title,
        content: revision.content,
        summary: revision.summary,
        images: revision.images,
        visibility: revision.visibility,
        status: "PUBLISHED" as const,
      };
    });

    const sideEffects = await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "SYSTEM",
          title: "帖子审核通过",
          content: revision ? `您的帖子「${post.title}」修改版本已通过审核并生效` : `您的帖子「${post.title}」已通过审核并发布`,
          userId: post.authorId,
          link: `/post/${post.id}`,
        },
      }),
      sendUserMail({
        userId: post.authorId,
        subject: "帖子审核通过",
        text: `您的帖子「${post.title}」已通过审核并发布。\n\n查看帖子：${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/post/${post.id}`,
      }),
    ]);
    for (const sideEffect of sideEffects) {
      if (sideEffect.status === "rejected") {
        console.error("Moderation approval side effect failed:", sideEffect.reason);
      }
    }

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    if (error instanceof ModerationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/moderation/[id]/approve error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
