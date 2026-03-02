import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { z } from "zod";

const querySchema = paginationSchema.extend({
  search: z.string().max(100).optional(),
  deleted: z.enum(["true", "false"]).optional(),
  postId: z.string().optional(),
});

/**
 * GET /api/admin/comments
 * List all comments with filters. MODERATOR+ only.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      deleted: searchParams.get("deleted") ?? undefined,
      postId: searchParams.get("postId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, search, deleted, postId } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (deleted === "true") where.isDeleted = true;
    else if (deleted === "false") where.isDeleted = false;
    if (postId) where.postId = postId;
    if (search) {
      where.content = { contains: search, mode: "insensitive" };
    }

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, nickname: true, email: true } },
          post: { select: { id: true, title: true } },
        },
      }),
      prisma.comment.count({ where }),
    ]);

    return NextResponse.json({
      comments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("GET /api/admin/comments error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
