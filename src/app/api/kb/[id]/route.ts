import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { updateArticleSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";

/**
 * GET /api/kb/[id]
 * Retrieve a single knowledge base article by ID.
 * - Published PUBLIC articles visible to all authenticated users
 * - DCR_ONLY articles visible only to users with dcrAccess or Admin role
 * - Unpublished articles visible only to Admin
 *
 * Validates: Requirements 14.1, 14.5
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const article = await prisma.knowledgeArticle.findUnique({ where: { id } });

    if (!article) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    const userRole = req.user.role;

    // Unpublished articles only visible to Admin
    if (!article.isPublished && userRole !== "ADMIN") {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    // DCR_ONLY visibility check
    if (article.visibility === "DCR_ONLY" && userRole !== "ADMIN") {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { dcrAccess: true },
      });

      if (!user?.dcrAccess) {
        return NextResponse.json({ error: "权限不足" }, { status: 403 });
      }
    }

    return NextResponse.json({ article });
  } catch (error) {
    console.error("GET /api/kb/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * PATCH /api/kb/[id]
 * Admin-only: update a knowledge base article.
 * Supports updating title (≤200), content (≤50000), category, visibility, isPublished.
 *
 * Validates: Requirements 14.3, 7.1-7.5
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ article });
  } catch (error) {
    console.error("PATCH /api/kb/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");

/**
 * DELETE /api/kb/[id]
 * Admin-only: delete a knowledge base article.
 * Returns 404 if article does not exist (Prisma P2025).
 *
 * Validates: Requirements 7.1-7.5
 */
export const DELETE = withAuth(async (
  _req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    await prisma.knowledgeArticle.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    console.error("DELETE /api/kb/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
