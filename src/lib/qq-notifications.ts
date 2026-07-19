import { type RequestStatus } from "@prisma/client";

import { getQQConfig } from "@/lib/qq-config";
import { generateQQGrant, hashQQGrant } from "@/lib/qq-grants";
import prisma from "@/lib/prisma";

const SITE_ORIGIN = (process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "");

const REVIEW_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: "待审核",
  NEED_MORE_INFO: "需补充信息",
  APPROVED: "审核通过",
  REJECTED: "审核未通过",
  MANUAL_REVIEW: "人工审核中",
};

async function createGrantMessage(
  userId: string,
  identityId: string,
  targetId: string,
  purpose: "CASE_REVIEW" | "TASK_PUBLISH",
  dedupeKey: string,
  content: (token: string) => string,
): Promise<boolean> {
  const config = getQQConfig();
  const token = generateQQGrant();

  return prisma.$transaction(async (tx) => {
    const grant = await tx.qQGrant.create({
      data: {
        tokenHash: hashQQGrant(token, config.grantHmacKey),
        purpose,
        userId,
        targetId,
        expiresAt: new Date(Date.now() + config.grantTtlSeconds * 1_000),
      },
      select: { id: true },
    });
    const queued = await tx.qQMessageOutbox.createMany({
      data: [{ dedupeKey, identityId, content: content(token) }],
      skipDuplicates: true,
    });
    if (queued.count === 0) await tx.qQGrant.delete({ where: { id: grant.id } });
    return queued.count === 1;
  });
}

export async function enqueueQQCaseReviewNotifications(caseId: string, category: string) {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] },
      qqIdentity: { isNot: null },
    },
    select: { id: true, qqIdentity: { select: { id: true } } },
  });

  return Promise.all(admins.map((admin) => createGrantMessage(
    admin.id,
    admin.qqIdentity!.id,
    caseId,
    "CASE_REVIEW",
    `case-review:${caseId}:${admin.id}`,
    (token) => `新委托待审核。分类：${category}；编号：${caseId}。${SITE_ORIGIN}/qq/review?token=${encodeURIComponent(token)}`,
  )));
}

export async function enqueueQQCaseReviewResult(
  submitterId: string,
  caseId: string,
  category: string,
  status: RequestStatus,
): Promise<boolean> {
  const identity = await prisma.qQIdentity.findUnique({
    where: { userId: submitterId },
    select: { id: true },
  });
  if (!identity) return false;

  if (status === "APPROVED") {
    return createGrantMessage(
      submitterId,
      identity.id,
      caseId,
      "TASK_PUBLISH",
      `case-review-result:${caseId}:${status}`,
      (token) => `委托审核通过。分类：${category}；编号：${caseId}。确认发布互助任务：${SITE_ORIGIN}/qq/publish?token=${encodeURIComponent(token)}`,
    );
  }

  const queued = await prisma.qQMessageOutbox.createMany({
    data: [{
      dedupeKey: `case-review-result:${caseId}:${status}`,
      identityId: identity.id,
      content: `委托状态更新为：${REVIEW_STATUS_LABELS[status]}。编号：${caseId}。查看站内工单：${SITE_ORIGIN}/dcr/tickets/${encodeURIComponent(caseId)}`,
    }],
    skipDuplicates: true,
  });
  return queued.count === 1;
}
