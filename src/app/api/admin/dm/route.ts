import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest, hasMinimumRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { SYSTEM_ANNOUNCEMENT_USER_ID } from "@/lib/announcement";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const url = new URL(req.url);
    const threadId = url.searchParams.get("threadId");
    const reviewableWhere = {
      isSystemReadOnly: false,
      participant1Id: { not: SYSTEM_ANNOUNCEMENT_USER_ID },
      participant2Id: { not: SYSTEM_ANNOUNCEMENT_USER_ID },
    };
    const threads = await prisma.dMThread.findMany({
      where: threadId ? { id: threadId, ...reviewableWhere } : reviewableWhere,
      include: {
        participant1: { select: { id: true, nickname: true } },
        participant2: { select: { id: true, nickname: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: threadId ? 100 : 1,
          include: { sender: { select: { id: true, nickname: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: threadId ? 1 : 100,
    });

    await logAudit(req.user.id, "REVIEW_DM", "DM_THREAD", threadId || "LIST", { threadId });
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("GET /api/admin/dm error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
