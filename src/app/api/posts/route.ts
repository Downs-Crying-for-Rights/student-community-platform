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
import { anonymizePsychologyPost, checkPostZoneAccess, dcrMatchedParticipantWhere } from "@/lib/post-access";
import { sendAdminActionMail } from "@/lib/mail";
import { canCreateDcrPost } from "@/lib/dcr-capabilities";
import { publicUserSelect, toPublicUser } from "@/lib/public-user";
import { createPrivateMediaUrl, parsePrivateMediaUrl } from "@/lib/oss";

// Query params schema for GET
const listQuerySchema = paginationSchema.extend({
  boardId: z.string().optional(),
  tagId: z.string().cuid().optional(),
  sort: z.enum(["latest", "popular"]).default("latest"),
  zone: z.enum(["PUBLIC", "PSYCHOLOGY", "DCR"]).optional(),
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"]).optional(),
  caseIds: z.string().optional(), // comma-separated case IDs for DCR post filtering
  authorId: z.string().optional(),
  bookmarkedBy: z.string().optional(),
  likedBy: z.string().optional(),
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
      authorId: searchParams.get("authorId") ?? undefined,
      bookmarkedBy: searchParams.get("bookmarkedBy") ?? undefined,
      likedBy: searchParams.get("likedBy") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, boardId, tagId, sort, zone, status: filterStatus, caseIds: caseIdsParam, authorId, bookmarkedBy, likedBy } = parsed.data;
    const skip = (page - 1) * pageSize;
    const userId = req.user?.id;
    const isModerator = req.user ? hasMinimumRole(req.user.role, "MODERATOR") : false;
    if ((bookmarkedBy || likedBy) && (!userId || (bookmarkedBy && bookmarkedBy !== userId) || (likedBy && likedBy !== userId))) {
      return NextResponse.json({ error: "只能查看自己的收藏和点赞记录" }, { status: userId ? 403 : 401 });
    }

    let requestedZone: BoardZone = zone ? BoardZone[zone] : BoardZone.PUBLIC;
    if (boardId) {
      const board = await prisma.board.findUnique({ where: { id: boardId }, select: { zone: true } });
      if (!board) return NextResponse.json({ error: "板块不存在" }, { status: 404 });
      requestedZone = board.zone;
    } else if (caseIdsParam) {
      requestedZone = BoardZone.DCR;
    }
    const zoneAccess = await checkPostZoneAccess(req.user, requestedZone);
    if (!zoneAccess.allowed) {
      return NextResponse.json({ error: zoneAccess.error }, { status: zoneAccess.status });
    }
    if (requestedZone === BoardZone.PSYCHOLOGY && (authorId || bookmarkedBy || likedBy)) {
      return NextResponse.json({ error: "心理区不支持按用户身份筛选" }, { status: 400 });
    }

    // Parse caseIds if provided (comma-separated)
    const caseIds = caseIdsParam ? caseIdsParam.split(",").filter(Boolean) : undefined;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (filterStatus && isModerator) {
      // Moderator+ can filter by specific status (for moderation kanban)
      where.status = PostStatus[filterStatus];
    } else if (isModerator) {
      // Moderators retain oversight of every status and shadow-banned author.
    } else if (userId) {
      // Logged-in users can inspect their own submissions in any status.
      where.AND = [
        {
          OR: [
            { status: PostStatus.PUBLISHED },
            { authorId: userId },
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

    // Deleted posts belong exclusively to the administration archive. They
    // must never reappear in member feeds, including the author's own feed.
    where.AND = [
      ...((where.AND as Record<string, unknown>[] | undefined) ?? []),
      { status: { not: PostStatus.DELETED } },
    ];

    if (boardId) {
      where.boardId = boardId;
    } else if (caseIds && caseIds.length > 0) {
      // DCR content is visible to other users only after the associated
      // delegation has passed explicit admin review.
      where.caseId = { in: caseIds };
      where.case_ = { requestStatus: "APPROVED" };
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

    // --- User profile filters ---
    if (authorId) {
      where.authorId = authorId;
    }
    if (bookmarkedBy) {
      where.bookmarks = { some: { userId: bookmarkedBy } };
    }
    if (likedBy) {
      where.likes = { some: { userId: likedBy } };
    }

    if (!isModerator) {
      where.AND = [
        ...((where.AND as Record<string, unknown>[] | undefined) ?? []),
        userId
          ? { OR: [{ visibility: "PUBLIC" }, { visibility: "MODS_ONLY", authorId: userId }, ...(requestedZone === BoardZone.DCR ? [{ AND: [{ visibility: "MATCHED" }, dcrMatchedParticipantWhere(userId)] }] : [])] }
          : { visibility: "PUBLIC" },
      ];
    } else if (requestedZone === BoardZone.PSYCHOLOGY) {
      where.visibility = { not: "MATCHED" };
    }
    if (requestedZone === BoardZone.DCR && !isModerator) {
      where.AND = [
        ...((where.AND as Record<string, unknown>[] | undefined) ?? []),
        { OR: [{ caseId: null }, { authorId: userId! }, { case_: { requestStatus: "APPROVED" } }] },
      ];
    }

    // Determine sort order
    const orderBy =
      sort === "popular"
        ? [{ isPinned: "desc" as const }, { pinnedAt: "desc" as const }, { likeCount: "desc" as const }, { createdAt: "desc" as const }]
        : [{ isPinned: "desc" as const }, { pinnedAt: "desc" as const }, { createdAt: "desc" as const }];

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          author: { select: publicUserSelect },
          board: { select: { id: true, name: true, zone: true } },
          tags: { include: { tag: true } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({
      posts: posts.map((post) => anonymizePsychologyPost({ ...post, author: toPublicUser(post.author) })),
      total,
      page,
      pageSize,
    });
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

    const { title, content, summary, boardId, tagIds, tagNames, images, visibility, dcrCategory, caseId, isAnonymous } = parsed.data;
    const imageKeys = images?.map(parsePrivateMediaUrl);
    if (imageKeys?.some((key) => !key)) {
      return NextResponse.json({ error: "图片必须通过平台上传接口提交" }, { status: 400 });
    }
    const normalizedImages = imageKeys?.map((key) => createPrivateMediaUrl(key!));
    const userId = req.user.id;

    // Fetch user attributes for ABAC check
    // OPTIMIZE: JWT session already carries role, onboardingDone, quizPassed, dcrAccess.
    // Expand AuthenticatedRequest.user to include these from JWT, then only DB-query
    // the remaining volatile fields: createdAt, violationCount, psychAccess, and dcrPledgeSigned.
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
        dcrContributionAccess: true,
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

    if (board.zone === BoardZone.PSYCHOLOGY && visibility === "MATCHED") {
      return NextResponse.json({ error: "心理区暂不支持匹配可见帖子" }, { status: 400 });
    }

    if (caseId && board.zone !== BoardZone.DCR) {
      return NextResponse.json({ error: "只有 DCR 区帖子可以关联工单" }, { status: 400 });
    }

    if (caseId) {
      const relatedCase = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
          submitterId: true,
          handlerId: true,
          requestStatus: true,
          handlers: { select: { userId: true } },
        },
      });
      const isAdmin = req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN";
      const isParticipant = relatedCase?.submitterId === userId
        || relatedCase?.handlerId === userId
        || relatedCase?.handlers.some((handler) => handler.userId === userId);
      if (!relatedCase || relatedCase.requestStatus !== "APPROVED") {
        return NextResponse.json({ error: "只能关联已经通过审核的工单" }, { status: 400 });
      }
      if (!isParticipant && !isAdmin) {
        return NextResponse.json({ error: "只能关联自己参与的工单" }, { status: 403 });
      }
    }

    // Check zone access
    const userAttrs: ABACUserAttributes = user;
    const zoneCheck = board.zone === BoardZone.DCR && canCreateDcrPost(user)
      ? { allowed: true }
      : board.zone === BoardZone.PSYCHOLOGY && hasMinimumRole(req.user.role, "MODERATOR")
      ? { allowed: true }
      : canAccessZone(userAttrs, board.zone);
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

    // Resolve tag IDs: use tagIds directly, or find/create from tagNames (batched)
    let resolvedTagIds = tagIds ?? [];
    if ((!resolvedTagIds || resolvedTagIds.length === 0) && tagNames && tagNames.length > 0) {
      const trimmedNames = tagNames.map(n => n.trim()).filter(Boolean);
      // 批量查询已有标签
      const existingTags = await prisma.tag.findMany({
        where: { name: { in: trimmedNames } },
        select: { id: true, name: true },
      });
      const existingMap = new Map(existingTags.map(t => [t.name, t.id]));
      // 找出缺失的标签
      const missingNames = trimmedNames.filter(n => !existingMap.has(n));
      // 批量创建缺失标签
      if (missingNames.length > 0) {
        await prisma.tag.createMany({
          data: missingNames.map(name => ({ name })),
        });
        const newTags = await prisma.tag.findMany({
          where: { name: { in: missingNames } },
          select: { id: true, name: true },
        });
        newTags.forEach(t => existingMap.set(t.name, t.id));
      }
      resolvedTagIds = trimmedNames.map(n => existingMap.get(n)!);
    }

    // Create post with tag relations
    const post = await prisma.post.create({
      data: {
        title,
        content,
        summary: finalSummary,
        images: normalizedImages ?? [],
        status,
        visibility: visibility ?? "PUBLIC",
        isAnonymous: finalIsAnonymous,
        anonymousId,
        dcrCategory: board.zone === BoardZone.DCR ? dcrCategory : null,
        caseId: board.zone === BoardZone.DCR ? caseId ?? null : null,
        authorId: userId,
        boardId,
        tags: resolvedTagIds && resolvedTagIds.length > 0
          ? { create: resolvedTagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        author: { select: publicUserSelect },
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
      { title, boardZone: board.zone, status, caseId: caseId ?? null },
    );

    await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新帖子待审核",
      text: `帖子「${post.title}」已提交，等待内容审核。`,
      actionUrl: "/admin/moderation",
    });

    return NextResponse.json({ post: anonymizePsychologyPost({ ...post, author: toPublicUser(post.author) }) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/posts error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
