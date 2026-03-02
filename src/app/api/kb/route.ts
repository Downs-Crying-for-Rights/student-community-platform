import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createArticleSchema, paginationSchema } from "@/lib/validators";
import type { ArticleVisibility } from "@prisma/client";
import { z } from "zod";

// Query params schema for GET
const listQuerySchema = paginationSchema.extend({
  category: z.string().optional(),
  all: z.enum(["true", "false"]).optional(),
});

/**
 * GET /api/kb
 * List knowledge base articles with pagination and optional category filter.
 * - All authenticated users can see PUBLIC articles
 * - DCR_ONLY articles visible only to users with dcrAccess=true or Admin role
 * - Only published articles are shown
 *
 * Validates: Requirements 14.1, 14.5
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      all: searchParams.get("all") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, category, all } = parsed.data;
    const skip = (page - 1) * pageSize;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Admin with all=true can see all articles including drafts
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
    const showAll = isAdmin && all === "true";

    // Determine visibility filter
    const visibilityFilter = await getVisibilityFilter(userId, userRole);

    // Build where clause
    const where: Record<string, unknown> = {
      visibility: { in: visibilityFilter },
    };

    // Only filter by isPublished when not in admin "all" mode
    if (!showAll) {
      where.isPublished = true;
    }

    if (category) {
      where.category = category;
    }

    const [articles, total] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          category: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          ...(showAll ? { isPublished: true } : {}),
        },
      }),
      prisma.knowledgeArticle.count({ where }),
    ]);

    return NextResponse.json({ articles, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/kb error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/kb
 * Create a new knowledge base article. Admin only.
 *
 * Validates: Requirements 14.3
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, content, category, visibility, isPublished } = parsed.data;

    const article = await prisma.knowledgeArticle.create({
      data: {
        title,
        content,
        category,
        visibility,
        isPublished,
      },
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    console.error("POST /api/kb error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");

/**
 * Determine which visibility levels the user can see.
 * - Admin always sees both PUBLIC and DCR_ONLY
 * - Users with dcrAccess see both
 * - Others see only PUBLIC
 */
async function getVisibilityFilter(
  userId: string,
  userRole: string,
): Promise<ArticleVisibility[]> {
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
    return ["PUBLIC", "DCR_ONLY"];
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dcrAccess: true },
  });

  if (user?.dcrAccess) {
    return ["PUBLIC", "DCR_ONLY"];
  }

  return ["PUBLIC"];
}
