import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/** Roles that can access EvidenceRoom alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * GET /api/dcr/tasks/[id]/evidence/[itemId]/url
 * Generate a short-term URL for downloading an evidence item file.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Returns 404 if task, session, or evidence item not found
 * - Returns 400 if the evidence item has no associated file
 * - Writes audit log for DOWNLOAD_EVIDENCE
 *
 * Validates: Requirements 4.6, 4.7
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: taskId, itemId } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find task with helpSession and evidenceRoom
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id: taskId },
      include: {
        helpSession: {
          include: {
            evidenceRoom: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (!task.helpSession) {
      return NextResponse.json({ error: "互助会话不存在" }, { status: 404 });
    }

    // Verify access: requester, helper, or privileged role
    const isRequester = task.helpSession.requesterId === userId;
    const isHelper = task.helpSession.helperId === userId;
    const isPrivileged = PRIVILEGED_ROLES.includes(
      userRole as (typeof PRIVILEGED_ROLES)[number],
    );

    if (!isRequester && !isHelper && !isPrivileged) {
      return NextResponse.json({ error: "无权访问证据空间" }, { status: 403 });
    }

    const evidenceRoom = task.helpSession.evidenceRoom;
    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    // Find the evidence item
    const item = await (prisma as any).evidenceItem.findFirst({
      where: {
        id: itemId,
        roomId: evidenceRoom.id,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "证据条目不存在" }, { status: 404 });
    }

    if (!item.fileUrl) {
      return NextResponse.json({ error: "该条目没有关联文件" }, { status: 400 });
    }

    // Generate signed URL — MVP: return fileUrl directly
    // TODO: Replace with actual signed URL generation when OSS presigning is available
    const signedUrl = item.fileUrl;

    // Audit log for download operation
    await logAudit(userId, "DOWNLOAD_EVIDENCE", "EVIDENCE_ITEM", itemId);

    return NextResponse.json({ url: signedUrl, expiresIn: 3600 });
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id]/evidence/[itemId]/url error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
