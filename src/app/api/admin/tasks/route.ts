import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * GET /api/admin/tasks
 * Return SUBMITTED and UNDER_REVIEW tasks for the admin review queue.
 * Requires MODERATOR+ role.
 *
 * Validates: Requirements 11.1
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userRole = req.user.role;

    if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));

    const where = {
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] as string[] },
    };

    const [tasks, total] = await Promise.all([
      prisma.mutualAidTask.findMany({
        where,
        include: {
          requester: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: [{ urgencyLevel: "desc" }, { createdAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.mutualAidTask.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("GET /api/admin/tasks error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
