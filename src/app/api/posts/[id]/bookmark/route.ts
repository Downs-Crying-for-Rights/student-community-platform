import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { checkPostAccess } from "@/lib/post-access";

/**
 * POST /api/posts/[id]/bookmark
 * Toggle bookmark on a post. If already bookmarked, removes the bookmark.
 * If not bookmarked, creates a bookmark.
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: postId } = context.params;
    const userId = req.user.id;

    // Verify post exists and is not deleted
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true, visibility: true, board: { select: { zone: true } } },
    });

    if (!post || post.status === "DELETED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const access = await checkPostAccess(req.user, post);
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
    if (post.status !== "PUBLISHED") {
      return NextResponse.json({ error: "该帖子当前不可收藏" }, { status: 403 });
    }

    const existingBookmark = await prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingBookmark) {
      // Remove bookmark
      await prisma.bookmark.delete({
        where: { userId_postId: { userId, postId } },
      });

      return NextResponse.json({ bookmarked: false });
    } else {
      // Create bookmark
      await prisma.bookmark.create({
        data: { userId, postId },
      });

      return NextResponse.json({ bookmarked: true });
    }
  } catch (error) {
    console.error("POST /api/posts/[id]/bookmark error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
