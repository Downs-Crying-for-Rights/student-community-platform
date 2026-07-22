import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withOptionalAuth, type OptionalAuthRequest } from "@/lib/rbac";
import { PostStatus } from "@prisma/client";

/**
 * GET /api/recommendations
 * Returns active weekly recommendations ordered by sortOrder. Public endpoint (no login required).
 * Includes related post data if postId is set.
 */
export const GET = withOptionalAuth(async (_req: OptionalAuthRequest) => {
  try {
    const recommendations = await prisma.weeklyRecommendation.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // Fetch related posts for recommendations that have a postId
    const postIds = recommendations
      .map((r) => r.postId)
      .filter((id): id is string => id !== null);

    let postsMap: Record<string, unknown> = {};
    if (postIds.length > 0) {
      const posts = await prisma.post.findMany({
        where: {
          id: { in: postIds }, status: PostStatus.PUBLISHED, visibility: "PUBLIC",
          board: { zone: "PUBLIC" }, author: { isShadowBanned: false },
        },
        select: {
          id: true,
          title: true,
          summary: true,
          images: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          author: {
            select: { id: true, nickname: true, avatar: true },
          },
        },
      });
      postsMap = Object.fromEntries(posts.map((p) => [p.id, p]));
    }

    const result = recommendations.map((rec) => ({
      ...rec,
      post: rec.postId ? postsMap[rec.postId] ?? null : null,
    }));

    return NextResponse.json({ recommendations: result });
  } catch (error) {
    console.error("GET /api/recommendations error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
});
