import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";

/**
 * GET /api/moderation/queue
 * Moderator+ only: list posts with PENDING status (moderation queue).
 * Supports pagination via ?page=&pageSize= query params.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = paginationSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where = { status: "PENDING" as const };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, nickname: true, avatar: true } },
          board: { select: { id: true, name: true, zone: true } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({ posts, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/moderation/queue error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
