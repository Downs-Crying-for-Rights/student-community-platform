import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * PATCH /api/notifications/[id]/read
 * Mark a single notification as read. Only the notification owner can mark it.
 *
 * Validates: Requirements 20.4, 33.4
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, isRead: true },
    });

    if (!notification) {
      return NextResponse.json({ error: "通知不存在" }, { status: 404 });
    }

    if (notification.userId !== userId) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    if (notification.isRead) {
      return NextResponse.json({ notification });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ notification: updated });
  } catch (error) {
    console.error("PATCH /api/notifications/[id]/read error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
