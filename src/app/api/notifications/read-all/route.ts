import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/**
 * POST /api/notifications/read-all
 * Mark all unread notifications as read for the authenticated user.
 *
 * Validates: Requirements 20.4, 33.5
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ updatedCount: result.count });
  } catch (error) {
    console.error("POST /api/notifications/read-all error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
