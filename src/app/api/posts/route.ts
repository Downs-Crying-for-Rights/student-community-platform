import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus, BoardZone } from "@prisma/client";
import { withAuth, withOptionalAuth, hasMinimumRole, type AuthenticatedRequest, type OptionalAuthRequest } from "@/lib/rbac";
import { canCreatePost, canAccessZone, type ABACUserAttributes } from "@/lib/abac";
import { createPostSchema, paginationSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { generateAnonymousId, truncateText } from "@/lib/utils";
import { z } from "zod";

// Query params schema for GET
const listQuerySchema = paginationSchema.extend({
  boardId: z.string().optional(),
  tagId: z.string().cuid().optional(),
  sort: z.enum(["latest", "popular"]).default("latest"),
  zone: z.enum(["PUBLIC", "PSYCHOLOGY", "DCR"]).optional(),
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"]).optional(),
  caseIds: z.string().optional(), // comma-separated case IDs for DCR post filtering
});

/**
 * GET /api/posts
 * Paginated post list with filtering by board, tag, and sort order.
 * - Filters out non-PUBLISHED posts (except requester's own PENDING posts)
 * - Filters out shadow banned users' posts (unless requester is the author)
 * - For public feed: only shows PUBLIC zone posts
 */
export const GET = withOptionalAuth(async (req: OptionalAuthRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      boardId: searchParams.get("boardId") ?? undefined,
      tagId: searchParams.get("tagId") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      zone: searchParams.get("zone") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      caseIds: searchParams.get("caseIds") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, boardId, tagId, sort, zone, status: filterStatus, caseIds: caseIdsParam } = parsed.data;
    const skip = (page - 1) * pageSize;
    const userId = req.user?.id;
    const isModerator = req.user ? hasMinimumRole(req.user.role, "MODERATOR") : false;

    // Parse caseIds if provided (comma-separated)
    const caseIds = caseIdsParam ? caseIdsParam.split(",").filter(Boolean) : undefined;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (filterStatus && isModerator) {
      // Moderator+ can filter by specific status (for moderation kanban)
      where.status = PostStatus[filterStatus];
    } else if (userId) {
      // Logged-in user: PUBLISHED posts + own PENDING posts, filter shadow-banned
      where.AND = [
        {
          OR: [
            { status: PostStatus.PUBLISHED },
            { status: PostStatus.PENDING, authorId: userId },
          ],
        },
        {
          OR: [
            { author: { isShadowBanned: false } },
            { authorId: userId },
          ],
        },
      ];
    } else {
      // Unauthenticated: only PUBLISHED posts from non-shadow-banned authors
      where.AND = [
        { status: PostStatus.PUBLISHED },
        { author: { isShadowBanned: false } },
      ];
    }

    if (boardId) {
      where.boardId = boardId;
    } else if (caseIds && caseIds.length > 0) {
      // Filter posts by associated case IDs (for DCR post visibility)
      where.caseId = { in: caseIds };
    } else if (zone) {
      // Filter by zone when explicitly specified
      where.board = { zone: BoardZone[zone] };
    } else {
      // Public feed: only show PUBLIC zone posts
      where.board = { zone: BoardZone.PUBLIC };
    }

    if (tagId) {
      where.tags = { some: { tagId } };
    }

    // Determine sort order
    const orderBy =
      sort === "popular"
        ? [{ likeCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy,
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

    return NextResponse.json({ posts, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/posts error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/posts
 * Create a new post. Requires authentication.
 * - Validates input with createPostSchema
 * - Checks ABAC canCreatePost (daily limit)
 * - Runs sensitive word scan on title + content
 * - All new posts default to PENDING status (require moderation approval)
 * - PSYCHOLOGY zone → force isAnonymous=true + generate anonymousId
 * - Creates PostTag relations
 * - Logs audit
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createPostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, content, summary, boardId, tagIds, tagNames, images, visibility, dcrCategory, isAnonymous } = parsed.data;
    const userId = req.user.id;

    // Fetch user attributes for ABAC check
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

    // Fetch board to determine zone
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, zone: true, isActive: true },
    });

    if (!board || !board.isActive) {
      return NextResponse.json({ error: "板块不存在或已停用" }, { status: 404 });
    }

    // Check zone access
    const userAttrs: ABACUserAttributes = user;
    const zoneCheck = canAccessZone(userAttrs, board.zone);
    if (!zoneCheck.allowed) {
      return NextResponse.json(
        { error: "权限不足", reason: zoneCheck.reason },
        { status: 403 },
      );
    }

    // Check ABAC daily post limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPostCount = await prisma.post.count({
      where: {
        authorId: userId,
        createdAt: { gte: todayStart },
        status: { not: PostStatus.DELETED },
      },
    });

    const postCheck = canCreatePost(userAttrs, todayPostCount);
    if (!postCheck.allowed) {
      return NextResponse.json(
        { error: postCheck.reason },
        { status: 403 },
      );
    }

    // Sensitive word scan on title + content
    const textToScan = `${title} ${content}`;
    const matches = await scanContent(textToScan);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "内容包含敏感词", matches },
        { status: 400 },
      );
    }

    // All new posts go to PENDING for moderation review
    const status: PostStatus = PostStatus.PENDING;

    // Psychology zone: force anonymous
    let finalIsAnonymous = isAnonymous ?? false;
    let anonymousId: string | null = null;
    if (board.zone === BoardZone.PSYCHOLOGY) {
      finalIsAnonymous = true;
      anonymousId = generateAnonymousId();
    } else if (finalIsAnonymous) {
      anonymousId = generateAnonymousId();
    }

    // Auto-generate summary if not provided
    const finalSummary = summary ?? truncateText(content, 60);

    // Resolve tag IDs: use tagIds directly, or find/create from tagNames
    let resolvedTagIds = tagIds ?? [];
    if ((!resolvedTagIds || resolvedTagIds.length === 0) && tagNames && tagNames.length > 0) {
      resolvedTagIds = [];
      for (const name of tagNames) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        let tag = await prisma.tag.findUnique({ where: { name: trimmed } });
        if (!tag) {
          tag = await prisma.tag.create({ data: { name: trimmed } });
        }
        resolvedTagIds.push(tag.id);
      }
    }

    // Create post with tag relations
    const post = await prisma.post.create({
      data: {
        title,
        content,
        summary: finalSummary,
        images: images ?? [],
        status,
        visibility: visibility ?? "PUBLIC",
        isAnonymous: finalIsAnonymous,
        anonymousId,
        dcrCategory: board.zone === BoardZone.DCR ? dcrCategory : null,
        authorId: userId,
        boardId,
        tags: resolvedTagIds && resolvedTagIds.length > 0
          ? { create: resolvedTagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
        board: { select: { id: true, name: true, zone: true } },
        tags: { include: { tag: true } },
      },
    });

    // Log audit
    await logAudit(
      userId,
      "CREATE_POST",
      AuditTargetType.POST,
      post.id,
      { title, boardZone: board.zone, status },
    );

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("POST /api/posts error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
