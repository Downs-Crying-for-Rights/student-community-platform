import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";
import { sendUserMail } from "@/lib/mail";

class ModerationConflictError extends Error {
  constructor(message = "内容已被其他审核员处理，请刷新审核队列") {
    super(message);
    this.name = "ModerationConflictError";
  }
}

const rejectSchema = z.object({
  reason: z.string().min(1, "拒绝原因不能为空").max(1000, "拒绝原因不能超过 1000 个字符"),
});

/**
 * POST /api/moderation/[id]/reject
 * Moderator+ only: reject a PENDING post, changing its status to REJECTED.
 * - Requires a rejection reason
 * - Creates a notification for the post author with the rejection reason
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

    const body = await req.json();
    const parsed = rejectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { reason } = parsed.data;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }
    if (post.status === "DELETED") {
      return NextResponse.json({ error: "已删除的帖子不能继续审核" }, { status: 400 });
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

    const updatedPost = await prisma.$transaction(async (tx) => {
      if (revision) {
        const claimed = await tx.postRevision.updateMany({
          where: { id: revision.id, status: "PENDING" },
          data: { status: "REJECTED", rejectionReason: reason, reviewerId: req.user.id, reviewedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ModerationConflictError();
        await logAudit(req.user.id, AuditAction.POST_REVISION_REJECT, AuditTargetType.POST, id, {
          revisionId: revision.id, reason,
        }, undefined, tx);
        return post;
      }
      const claimed = await tx.post.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (claimed.count !== 1) throw new ModerationConflictError();
      await logAudit(req.user.id, AuditAction.CONTENT_REJECT, AuditTargetType.POST, id, {
        previousStatus: "PENDING", newStatus: "REJECTED", title: post.title, reason,
      }, undefined, tx);
      return { ...post, status: "REJECTED" as const };
    });

    const sideEffects = await Promise.allSettled([
      prisma.notification.create({
        data: {
          type: "SYSTEM",
          title: "帖子审核未通过",
          content: `您的帖子「${post.title}」${revision ? "修改版本" : ""}未通过审核，原因：${reason}`,
          userId: post.authorId,
          link: `/post/${post.id}`,
        },
      }),
      sendUserMail({
        userId: post.authorId,
        subject: "帖子审核未通过",
        text: `您的帖子「${post.title}」未通过审核，原因：${reason}。请登录平台查看详情。`,
      }),
    ]);
    for (const sideEffect of sideEffects) {
      if (sideEffect.status === "rejected") {
        console.error("Moderation rejection side effect failed:", sideEffect.reason);
      }
    }

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    if (error instanceof ModerationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/moderation/[id]/reject error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
