import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { createProtectedMediaUrl, getMediaKey } from "@/lib/oss";

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

    const item = await prisma.evidenceItem.findFirst({
      where: { id: itemId, room: { session: { taskId } } },
      include: {
        room: { include: { session: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "证据条目不存在" }, { status: 404 });
    }

    const isRequester = item.room.session.requesterId === userId;
    const isHelper = item.room.session.helperId === userId;
    const isPrivileged = PRIVILEGED_ROLES.includes(
      userRole as (typeof PRIVILEGED_ROLES)[number],
    );

    if (!isRequester && !isHelper && !isPrivileged) {
      return NextResponse.json({ error: "无权访问证据空间" }, { status: 403 });
    }


    if (!item.fileUrl) {
      return NextResponse.json({ error: "该条目没有关联文件" }, { status: 400 });
    }

    const key = getMediaKey(item.fileUrl);
    if (!key) return NextResponse.json({ error: "文件地址无效" }, { status: 410 });
    const signedUrl = createProtectedMediaUrl(key, "EVIDENCE", item.id, 300);

    // Audit log for download operation
    await logAudit(userId, "DOWNLOAD_EVIDENCE", "EVIDENCE_ITEM", itemId);

    return NextResponse.json({ url: signedUrl, expiresIn: 300 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id]/evidence/[itemId]/url error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
