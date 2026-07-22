import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";

/**
 * POST /api/psych/session/[id]/close
 * Close a confide session.
 * - Requires auth
 * - Only requester or listener can close
 * - Update status to CLOSED, set closedAt
 * - expiresAt already set (30 days from creation)
 * - Create notification for the other party
 *
 * Validates: Requirements 12.6
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;

    const confideRequest = await prisma.confideRequest.findUnique({
      where: { id },
    });

    if (!confideRequest) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    // Only requester or listener can close
    if (
      confideRequest.requesterId !== userId &&
      confideRequest.listenerId !== userId
    ) {
      return NextResponse.json({ error: "无权关闭此会话" }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`psych-session:${id}`}))`;
      const current = await tx.confideRequest.findUnique({ where: { id } });
      if (!current) return null;
      if (current.requesterId !== userId && current.listenerId !== userId) throw new Error("SESSION_FORBIDDEN");
      if (current.status === "CLOSED") return { updated: current, newlyClosed: false };
      const updated = await tx.confideRequest.update({
        where: { id },
        data: { status: "CLOSED", closedAt: new Date() },
      });
      await logAudit(
        userId,
        AuditAction.CONFIDE_CLOSE,
        AuditTargetType.CONFIDE_REQUEST,
        id,
        { closedBy: userId },
        undefined,
        tx,
      );
      return { updated, newlyClosed: true };
    });
    if (!result) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    const { updated, newlyClosed } = result;

    // Notify the other party
    const otherPartyId =
      confideRequest.requesterId === userId
        ? confideRequest.listenerId
        : confideRequest.requesterId;

    if (newlyClosed && otherPartyId) {
      await createNotification(
        otherPartyId,
        "PSYCH_MATCH",
        "倾听会话已结束",
        "对方已结束本次倾听会话",
      );
    }

    return NextResponse.json({
      confideRequest: {
        id: updated.id,
        status: updated.status,
        closedAt: updated.closedAt,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_FORBIDDEN") {
      return NextResponse.json({ error: "无权关闭此会话" }, { status: 403 });
    }
    console.error("POST /api/psych/session/[id]/close error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
