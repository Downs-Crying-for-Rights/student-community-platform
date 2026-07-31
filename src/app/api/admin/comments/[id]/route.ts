import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  isDeleted: z.boolean(),
  reason: z.string().trim().min(1, "必须填写操作原因").max(500),
});

/**
 * PATCH /api/admin/comments/[id]
 * Toggle comment deleted status. MODERATOR+ only.
 * Used for: delete or restore comments.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.comment.findUnique({
      where: { id },
      select: { id: true, isDeleted: true, postId: true, authorId: true, content: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const { isDeleted, reason } = parsed.data;

    // Update comment and adjust post comment count
    const countDelta = isDeleted && !existing.isDeleted ? -1 : !isDeleted && existing.isDeleted ? 1 : 0;

    await prisma.$transaction(async (tx) => {
      const changed = await tx.comment.updateMany({
        where: { id, isDeleted: existing.isDeleted },
        data: { isDeleted, reportAutoHidden: false },
      });
      if (changed.count !== 1) throw new Error("COMMENT_STATE_CHANGED");
      if (countDelta !== 0) {
        await tx.post.update({
          where: { id: existing.postId },
          data: { commentCount: { increment: countDelta } },
        });
      }
      if (countDelta !== 0) {
        await tx.notification.create({
            data: {
              userId: existing.authorId,
              type: "SYSTEM",
              title: isDeleted ? "评论已被删除" : "评论已恢复",
              content: isDeleted ? `你的评论已由平台删除。原因：${reason}` : "你的评论已由平台恢复。",
              link: `/post/${existing.postId}`,
            },
          });
      }
    });

    const action = isDeleted ? "ADMIN_DELETE_COMMENT" : "ADMIN_RESTORE_COMMENT";
    await logAudit(req.user.id, action, AuditTargetType.COMMENT, id, {
      postId: existing.postId,
      reason,
    });

    return NextResponse.json({ message: isDeleted ? "评论已删除" : "评论已恢复" });
  } catch (error) {
    if (error instanceof Error && error.message === "COMMENT_STATE_CHANGED") {
      return NextResponse.json({ error: "评论状态已变化，请刷新后重试" }, { status: 409 });
    }
    console.error("PATCH /api/admin/comments/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
