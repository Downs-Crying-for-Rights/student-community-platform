import prisma from "@/lib/prisma";
import { AuditAction, AuditTargetType } from "@/lib/audit";

export interface PostApprovalAudit {
  targetId: string;
  createdAt: Date;
  operator: {
    id: string;
    nickname: string | null;
    username: string | null;
    role: string;
  };
}

export async function getLatestPostApprovalAudits(
  postIds: string[],
): Promise<Map<string, PostApprovalAudit>> {
  if (postIds.length === 0) return new Map();

  const approvalLogs = await prisma.auditLog.findMany({
    where: {
      targetType: AuditTargetType.POST,
      targetId: { in: postIds },
      action: { in: [AuditAction.CONTENT_APPROVE, AuditAction.POST_REVISION_APPROVE] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      targetId: true,
      createdAt: true,
      operator: {
        select: { id: true, nickname: true, username: true, role: true },
      },
    },
  });

  const latestApprovalByPost = new Map<string, PostApprovalAudit>();
  for (const approvalLog of approvalLogs) {
    if (!latestApprovalByPost.has(approvalLog.targetId)) {
      latestApprovalByPost.set(approvalLog.targetId, approvalLog);
    }
  }
  return latestApprovalByPost;
}
