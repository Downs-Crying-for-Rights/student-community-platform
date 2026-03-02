import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * POST /api/posts/[id]/like
 * Toggle like on a post. If already liked, removes the like and decrements likeCount.
 * If not liked, creates a like and increments likeCount.
 * Uses a transaction for atomicity.
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
      select: { id: true, status: true },
    });

    if (!post || post.status === "DELETED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const existingLike = await prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingLike) {
      // Unlike: remove like and decrement count
      const [, updatedPost] = await prisma.$transaction([
        prisma.like.delete({
          where: { userId_postId: { userId, postId } },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        }),
      ]);

      return NextResponse.json({
        liked: false,
        likeCount: updatedPost.likeCount,
      });
    } else {
      // Like: create like and increment count
      const [, updatedPost] = await prisma.$transaction([
        prisma.like.create({
          data: { userId, postId },
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        }),
      ]);

      return NextResponse.json({
        liked: true,
        likeCount: updatedPost.likeCount,
      });
    }
  } catch (error) {
    console.error("POST /api/posts/[id]/like error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
