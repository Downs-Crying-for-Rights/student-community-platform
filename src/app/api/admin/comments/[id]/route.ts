import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  isDeleted: z.boolean(),
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
      select: { id: true, isDeleted: true, postId: true, content: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const { isDeleted } = parsed.data;

    // Update comment and adjust post comment count
    const countDelta = isDeleted && !existing.isDeleted ? -1 : !isDeleted && existing.isDeleted ? 1 : 0;

    await prisma.$transaction([
      prisma.comment.update({ where: { id }, data: { isDeleted } }),
      ...(countDelta !== 0
        ? [prisma.post.update({
            where: { id: existing.postId },
            data: { commentCount: { increment: countDelta } },
          })]
        : []),
    ]);

    const action = isDeleted ? "ADMIN_DELETE_COMMENT" : "ADMIN_RESTORE_COMMENT";
    await logAudit(req.user.id, action, AuditTargetType.COMMENT, id, {
      postId: existing.postId,
    });

    return NextResponse.json({ message: isDeleted ? "评论已删除" : "评论已恢复" });
  } catch (error) {
    console.error("PATCH /api/admin/comments/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
