import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { searchQuerySchema, paginationSchema } from "@/lib/validators";
import { canAccessZone, type ABACUserAttributes } from "@/lib/abac";
import { z } from "zod";

// Query params schema
const searchParamsSchema = paginationSchema.extend({
  q: searchQuerySchema,
  type: z.enum(["posts", "users", "tags"]).default("posts"),
  boardId: z.string().optional(),
});

/**
 * GET /api/search
 * Full-text search supporting posts, users, and tags.
 * - Posts: search by title and content (case-insensitive), filter DELETED, filter private zone posts by access
 * - Users: search by nickname, return public info only
 * - Tags: search by name, include post count
 * - Paginated (default 20 per page)
 * - Shadow banned users' posts are filtered out
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = searchParamsSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      boardId: searchParams.get("boardId") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { q, type, boardId, page, pageSize } = parsed.data;
    const skip = (page - 1) * pageSize;
    const userId = req.user.id;

    if (type === "posts") {
      return await searchPosts(q, boardId, skip, pageSize, page, userId);
    }

    if (type === "users") {
      return await searchUsers(q, skip, pageSize, page);
    }

    if (type === "tags") {
      return await searchTags(q, skip, pageSize, page);
    }

    return NextResponse.json({ error: "不支持的搜索类型" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * Search posts by title and content.
 * Filters out DELETED posts, shadow banned users' posts,
 * and private zone (PSYCHOLOGY/DCR) posts unless user has access.
 */
async function searchPosts(
  q: string,
  boardId: string | undefined,
  skip: number,
  pageSize: number,
  page: number,
  userId: string,
) {
  // Fetch user attributes for zone access checks
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      violationCount: true,
      onboardingDone: true,
      quizPassed: true,
      psychAccess: true,
      dcrAccess: true,
      dcrPledgeSigned: true,
      reputationScore: true,
      role: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const userAttrs: ABACUserAttributes = user;

  // Determine which zones the user can access
  const accessibleZones: string[] = ["PUBLIC"];
  if (canAccessZone(userAttrs, "PSYCHOLOGY").allowed) {
    accessibleZones.push("PSYCHOLOGY");
  }
  if (canAccessZone(userAttrs, "DCR").allowed) {
    accessibleZones.push("DCR");
  }

  // Build where clause — only show PUBLISHED posts in search
  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    author: { isShadowBanned: false },
    board: { zone: { in: accessibleZones } },
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ],
  };

  if (boardId) {
    where.boardId = boardId;
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
        board: { select: { id: true, name: true, zone: true } },
        tags: { include: { tag: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return NextResponse.json({ results: posts, total, page, pageSize });
}

/**
 * Search users by nickname. Returns public info only.
 */
async function searchUsers(
  q: string,
  skip: number,
  pageSize: number,
  page: number,
) {
  const where = {
    nickname: { contains: q, mode: "insensitive" as const },
    isBanned: false,
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        _count: { select: { posts: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ results: users, total, page, pageSize });
}

/**
 * Search tags by name. Includes post count.
 */
async function searchTags(
  q: string,
  skip: number,
  pageSize: number,
  page: number,
) {
  const where = {
    name: { contains: q, mode: "insensitive" as const },
  };

  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        _count: { select: { posts: true } },
      },
    }),
    prisma.tag.count({ where }),
  ]);

  return NextResponse.json({ results: tags, total, page, pageSize });
}
