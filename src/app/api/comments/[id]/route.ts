import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { commentContentSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { anonymizePsychologyComment, checkPostAccess } from "@/lib/post-access";

/**
 * PATCH /api/comments/[id]
 * Edit own comment only. Re-runs sensitive word scan on updated content.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        isDeleted: true,
        post: {
          select: {
            authorId: true,
            visibility: true,
            board: { select: { zone: true } },
          },
        },
      },
    });

    if (!existing || existing.isDeleted) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    if (existing.authorId !== req.user.id) {
      return NextResponse.json({ error: "只能编辑自己的评论" }, { status: 403 });
    }

    const post = existing.post ?? { board: { zone: "PUBLIC" as const } };
    const access = await checkPostAccess(req.user, post);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await req.json();
    const parsed = commentContentSchema.safeParse(body.content);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const content = parsed.data;

    // Re-run sensitive word scan
    const matches = await scanContent(content);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "评论内容包含敏感词", matches },
        { status: 400 },
      );
    }

    const comment = await prisma.comment.update({
      where: { id },
      data: { content },
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    await logAudit(
      req.user.id,
      "EDIT_COMMENT",
      AuditTargetType.COMMENT,
      id,
    );

    return NextResponse.json({
      comment: post.board.zone === "PSYCHOLOGY"
        ? anonymizePsychologyComment(comment)
        : comment,
    });
  } catch (error) {
    console.error("PATCH /api/comments/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * DELETE /api/comments/[id]
 * Soft delete (isDeleted = true).
 * Author can delete own comment. Moderator+ can delete any comment.
 */
export const DELETE = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        isDeleted: true,
        postId: true,
        post: {
          select: {
            authorId: true,
            visibility: true,
            board: { select: { zone: true } },
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    if (existing.isDeleted) {
      return NextResponse.json({ error: "评论已被删除" }, { status: 400 });
    }

    const isAuthor = existing.authorId === req.user.id;
    const isModerator = hasMinimumRole(req.user.role, "MODERATOR");

    const access = await checkPostAccess(
      req.user,
      existing.post ?? { board: { zone: "PUBLIC" as const } },
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (!isAuthor && !isModerator) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.comment.update({
        where: { id },
        data: { isDeleted: true },
      }),
      prisma.post.update({
        where: { id: existing.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);

    await logAudit(
      req.user.id,
      "DELETE_COMMENT",
      AuditTargetType.COMMENT,
      id,
      { deletedBy: isAuthor ? "author" : "moderator" },
    );

    return NextResponse.json({ message: "评论已删除" });
  } catch (error) {
    console.error("DELETE /api/comments/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
