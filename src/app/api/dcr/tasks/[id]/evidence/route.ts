import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createEvidenceItemSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit } from "@/lib/audit";

/** Roles that can access EvidenceRoom alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * Verify the current user has access to the EvidenceRoom for a given task.
 * Returns the helpSession (with evidenceRoom) or a NextResponse error.
 */
async function verifyAccess(
  taskId: string,
  userId: string,
  userRole: string,
): Promise<
  | { ok: true; session: { id: string; requesterId: string; helperId: string; evidenceRoom: { id: string } | null } }
  | { ok: false; response: NextResponse }
> {
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
    return { ok: false, response: NextResponse.json({ error: "任务不存在" }, { status: 404 }) };
  }

  if (!task.helpSession) {
    return { ok: false, response: NextResponse.json({ error: "互助会话不存在" }, { status: 404 }) };
  }

  const isRequester = task.helpSession.requesterId === userId;
  const isHelper = task.helpSession.helperId === userId;
  const isPrivileged = PRIVILEGED_ROLES.includes(
    userRole as (typeof PRIVILEGED_ROLES)[number],
  );

  if (!isRequester && !isHelper && !isPrivileged) {
    return { ok: false, response: NextResponse.json({ error: "无权访问证据空间" }, { status: 403 }) };
  }

  return { ok: true, session: task.helpSession };
}


/**
 * GET /api/dcr/tasks/[id]/evidence
 * Return evidence items for the task's EvidenceRoom, grouped by type.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Groups items by type: EVIDENCE_ITEM, NOTE, OUTCOME, FOLLOW_UP
 * - Writes audit log for VIEW_EVIDENCE
 *
 * Validates: Requirements 4.2, 4.7, 4.8
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const access = await verifyAccess(id, userId, userRole);
    if (!access.ok) return access.response;

    const { session } = access;
    const evidenceRoom = session.evidenceRoom;

    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    const allItems = await (prisma as any).evidenceItem.findMany({
      where: { roomId: evidenceRoom.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        description: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        uploaderId: true,
      },
    });

    // Group by type
    const grouped: Record<string, typeof allItems> = {
      EVIDENCE_ITEM: [],
      NOTE: [],
      OUTCOME: [],
      FOLLOW_UP: [],
    };

    for (const item of allItems) {
      if (grouped[item.type]) {
        grouped[item.type].push(item);
      }
    }

    // Audit log
    await logAudit(userId, "VIEW_EVIDENCE", "EVIDENCE_ROOM", evidenceRoom.id);

    return NextResponse.json({
      items: grouped,
      total: allItems.length,
    });
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id]/evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/dcr/tasks/[id]/evidence
 * Create an evidence item in the task's EvidenceRoom.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Validates body with createEvidenceItemSchema (sensitiveConfirmed must be true)
 * - Scans description for sensitive words; returns 400 if flagged
 * - If fileName provided, scans fileName for sensitive words too
 * - Creates EvidenceItem
 * - Writes audit log for CREATE_EVIDENCE
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.7, 4.8
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const access = await verifyAccess(id, userId, userRole);
    if (!access.ok) return access.response;

    const { session } = access;
    const evidenceRoom = session.evidenceRoom;

    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = createEvidenceItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { type, description, fileUrl, fileName, fileSize } = parsed.data;

    // Sensitive word detection on description
    const descMatches = await scanContent(description);
    if (descMatches.length > 0) {
      return NextResponse.json(
        { error: "描述包含敏感词，请修改后重试", matches: descMatches },
        { status: 400 },
      );
    }

    // Sensitive word detection on fileName if provided
    if (fileName) {
      const fileNameMatches = await scanContent(fileName);
      if (fileNameMatches.length > 0) {
        return NextResponse.json(
          { error: "文件名包含敏感词，请修改后重试", matches: fileNameMatches },
          { status: 400 },
        );
      }
    }

    // Create evidence item
    const item = await (prisma as any).evidenceItem.create({
      data: {
        type,
        description,
        fileUrl: fileUrl ?? null,
        fileName: fileName ?? null,
        fileSize: fileSize ?? null,
        roomId: evidenceRoom.id,
        uploaderId: userId,
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
      },
    });

    // Audit log
    await logAudit(userId, "CREATE_EVIDENCE", "EVIDENCE_ITEM", item.id);

    return NextResponse.json(
      { id: item.id, type: item.type, createdAt: item.createdAt },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
