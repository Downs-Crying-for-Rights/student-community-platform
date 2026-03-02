import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createCommentSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditTargetType } from "@/lib/audit";

const authorSelect = { id: true, nickname: true, avatar: true } as const;

/**
 * Calculate the depth of a comment by traversing the parent chain.
 * Top-level comments have depth 0, their replies depth 1, etc.
 */
async function getCommentDepth(commentId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = commentId;

  while (currentId) {
    const row: { parentId: string | null } | null =
      await prisma.comment.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    if (!row || !row.parentId) break;
    depth++;
    currentId = row.parentId;
  }

  return depth;
}

/**
 * GET /api/posts/[id]/comments
 * List comments for a post, ordered by createdAt asc.
 * Includes author info and nested replies (up to depth 2 for display).
 * Filters out deleted comments.
 */
export const GET = withAuth(async (
  _req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: postId } = context.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Fetch top-level comments (no parent) with nested replies up to 2 levels
    const comments = await prisma.comment.findMany({
      where: { postId, parentId: null, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: authorSelect },
        replies: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: authorSelect },
            replies: {
              where: { isDeleted: false },
              orderBy: { createdAt: "asc" },
              include: { author: { select: authorSelect } },
            },
          },
        },
      },
    });

    const total = await prisma.comment.count({
      where: { postId, isDeleted: false },
    });

    return NextResponse.json({ comments, total });
  } catch (error) {
    console.error("GET /api/posts/[id]/comments error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/posts/[id]/comments
 * Create a comment on a post.
 * - Validates with createCommentSchema
 * - Checks post exists and is not PENDING (pending posts can't be commented)
 * - If parentId provided, checks parent exists and nesting depth < 3
 * - Runs scanContent on comment content
 * - Increments post.commentCount
 * - Creates notification for post author (if commenter != author)
 * - Logs audit
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: postId } = context.params;

    const body = await req.json();
    const parsed = createCommentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { content, parentId } = parsed.data;

    // Check post exists and status
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true, title: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status === "PENDING") {
      return NextResponse.json({ error: "待审核帖子禁止评论" }, { status: 403 });
    }

    if (post.status === "DELETED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Check nesting depth if parentId provided
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, isDeleted: true, parentId: true },
      });

      if (!parentComment || parentComment.isDeleted) {
        return NextResponse.json({ error: "父评论不存在" }, { status: 404 });
      }

      if (parentComment.postId !== postId) {
        return NextResponse.json({ error: "父评论不属于该帖子" }, { status: 400 });
      }

      // Calculate depth by traversing parent chain
      const depth = await getCommentDepth(parentId);
      if (depth >= 2) {
        // Parent is at depth 2 (0-indexed), so child would be depth 3 — exceeds max 3 layers
        return NextResponse.json(
          { error: "评论嵌套层数已达上限" },
          { status: 400 },
        );
      }
    }

    // Sensitive word scan
    const matches = await scanContent(content);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "评论内容包含敏感词", matches },
        { status: 400 },
      );
    }

    // Create comment
    const created = await prisma.comment.create({
      data: {
        content,
        authorId: req.user.id,
        postId,
        parentId: parentId ?? null,
      },
      include: { author: { select: authorSelect } },
    });

    // Increment post comment count
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    // Create notification for post author (if commenter != post author)
    if (post.authorId !== req.user.id) {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: "COMMENT",
          title: "新评论",
          content: `你的帖子「${post.title}」收到了新评论`,
          link: `/post/${postId}`,
        },
      });
    }

    // Log audit
    await logAudit(
      req.user.id,
      "CREATE_COMMENT",
      AuditTargetType.COMMENT,
      created.id,
      { postId, parentId: parentId ?? null },
    );

    return NextResponse.json({ comment: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/posts/[id]/comments error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
