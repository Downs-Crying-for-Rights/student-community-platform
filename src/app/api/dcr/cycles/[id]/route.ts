import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * GET /api/dcr/cycles/[id]
 * Get cycle detail with all links.
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    const cycle = await prisma.mutualAidCycle.findUnique({
      where: { id },
      include: {
        initiator: { select: { id: true, nickname: true, avatar: true } },
        links: {
          orderBy: { createdAt: "asc" },
          include: {
            fromUser: { select: { id: true, nickname: true, avatar: true } },
            toUser: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });

    if (!cycle) {
      return NextResponse.json({ error: "互助循环不存在" }, { status: 404 });
    }

    // 验证用户是否为参与者
    const isParticipant =
      cycle.initiatorId === userId ||
      cycle.links.some((l) => l.fromUserId === userId || l.toUserId === userId);

    if (!isParticipant && req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "无权查看此互助循环" }, { status: 403 });
    }

    return NextResponse.json({ cycle });
  } catch (error) {
    console.error("GET /api/dcr/cycles/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
