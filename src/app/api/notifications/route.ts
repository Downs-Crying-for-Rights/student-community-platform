import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications, paginated, ordered by createdAt desc.
 *
 * Query params: page (default 1), pageSize (default 20)
 *
 * Validates: Requirements 20.4, 33.1
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
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
    const userId = req.user.id;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return NextResponse.json({ notifications, total, unreadCount, page, pageSize });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
