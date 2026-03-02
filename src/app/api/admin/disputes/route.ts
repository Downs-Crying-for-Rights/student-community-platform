import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";

const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * GET /api/admin/disputes
 * Return all DISPUTED status mutual-aid tasks for moderator review.
 *
 * - Requires MODERATOR/ADMIN/SUPER_ADMIN role.
 * - Supports pagination (page, pageSize).
 * - Includes requester info, helpSession (with helperId), and timeline.
 *
 * Validates: Requirements 6.5, 11.2
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userRole = req.user.role;

    if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = paginationSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, pageSize } = parsed.data;

    const where = { status: "DISPUTED" as const };

    const [disputes, total] = await Promise.all([
      (prisma as any).mutualAidTask.findMany({
        where,
        include: {
          requester: {
            select: {
              id: true,
              nickname: true,
              email: true,
              avatar: true,
            },
          },
          helpSession: {
            select: {
              id: true,
              helperId: true,
              requesterId: true,
              createdAt: true,
            },
          },
          timeline: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (prisma as any).mutualAidTask.count({ where }),
    ]);

    return NextResponse.json({
      disputes,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET /api/admin/disputes error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
