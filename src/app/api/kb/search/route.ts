import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { searchQuerySchema, paginationSchema } from "@/lib/validators";
import type { ArticleVisibility } from "@prisma/client";
import { z } from "zod";

// Query params schema
const searchParamsSchema = paginationSchema.extend({
  q: searchQuerySchema,
});

/**
 * GET /api/kb/search
 * Full-text search across knowledge base articles (title + content).
 * - Same visibility filtering as article list
 * - Only published articles are searched
 * - Paginated results
 *
 * Validates: Requirements 14.4, 14.5
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = searchParamsSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { q, page, pageSize } = parsed.data;
    const skip = (page - 1) * pageSize;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine visibility filter
    const visibilityFilter = await getVisibilityFilter(userId, userRole);

    // Build where clause with full-text search on title and content
    const where = {
      isPublished: true,
      visibility: { in: visibilityFilter },
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { content: { contains: q, mode: "insensitive" as const } },
      ],
    };

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
        },
      }),
      prisma.knowledgeArticle.count({ where }),
    ]);

    return NextResponse.json({ articles, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/kb/search error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * Determine which visibility levels the user can see.
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
