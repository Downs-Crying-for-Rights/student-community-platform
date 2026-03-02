import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * GET /api/admin/tasks/[id]/export-evidence
 * Export all evidence items for a given task as a JSON download.
 * - Requires MODERATOR/ADMIN/SUPER_ADMIN role
 * - Fetches all evidence items from the task's EvidenceRoom
 * - Returns JSON with Content-Disposition header for download
 * - Logs the export action via audit log
 *
 * Validates: Requirements 11.3, 4.7
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    if (!MODERATOR_ROLES.includes(userRole as (typeof MODERATOR_ROLES)[number])) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = context.params;

    // Fetch task with helpSession and evidenceRoom
    const task = await (prisma as any).mutualAidTask.findUnique({
      where: { id },
      include: {
        helpSession: {
          include: {
            evidenceRoom: {
              include: {
                items: {
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
                },
              },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    if (!task.helpSession?.evidenceRoom) {
      return NextResponse.json({ error: "该任务暂无证据数据" }, { status: 404 });
    }

    const evidenceRoom = task.helpSession.evidenceRoom;
    const items = evidenceRoom.items || [];

    // Build export payload
    const exportData = {
      taskId: task.id,
      taskTitle: task.title,
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      totalItems: items.length,
      items: items.map((item: Record<string, unknown>) => ({
        id: item.id,
        type: item.type,
        description: item.description,
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileUrl: item.fileUrl,
        createdAt: item.createdAt,
        uploaderId: item.uploaderId,
      })),
    };

    // Write audit log for export
    await logAudit(
      userId,
      "EXPORT_EVIDENCE",
      "EVIDENCE_ROOM",
      evidenceRoom.id,
      { taskId: task.id, itemCount: items.length },
    );

    // Return as JSON download
    const jsonStr = JSON.stringify(exportData, null, 2);
    const fileName = `evidence-export-${task.id}.json`;

    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/tasks/[id]/export-evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
