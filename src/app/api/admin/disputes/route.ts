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
      prisma.helpSession.findMany({
        where,
        include: {
          task: {
            include: {
              requester: { select: { id: true, nickname: true, email: true, avatar: true } },
              timeline: { orderBy: { createdAt: "desc" } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.helpSession.count({ where }),
    ]);

    return NextResponse.json({
      disputes: disputes.map((session) => {
        const marker = `[session:${session.id}]`;
        const event = session.task.timeline.find((item) => item.action === "dispute" && item.details?.startsWith(marker));
        return {
          ...session.task,
          disputeSessionId: session.id,
          disputeExplanation: event?.details?.slice(marker.length).trim() ?? "",
          helpSession: {
            id: session.id,
            helperId: session.helperId,
            requesterId: session.requesterId,
            statusBeforeDispute: session.statusBeforeDispute,
            createdAt: session.createdAt,
          },
        };
      }),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("GET /api/admin/disputes error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
