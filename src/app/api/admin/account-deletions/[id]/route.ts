import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { deleteSensitiveObject } from "@/lib/oss";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const reviewSchema = z.object({
  action: z.enum(["reject", "approve"]),
  note: z.string().trim().min(1).max(1000),
});

export const POST = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsed = reviewSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "请填写审核说明" }, { status: 400 });
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { id: context.params.id },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!request) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: "申请已处理" }, { status: 409 });
  if (request.userId === req.user.id) return NextResponse.json({ error: "不能审核自己的注销申请" }, { status: 403 });
  if (["ADMIN", "SUPER_ADMIN"].includes(request.user.role) && req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "只有超级管理员可处理管理账号" }, { status: 403 });
  }
  if (parsed.data.action === "approve" && request.user.role === "SUPER_ADMIN") {
    const activeSuperAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isBanned: false } });
    if (activeSuperAdmins <= 1) return NextResponse.json({ error: "不能注销最后一个有效超级管理员" }, { status: 409 });
  }

  if (parsed.data.action === "reject") {
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.accountDeletionRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", reviewNote: parsed.data.note, reviewerId: req.user.id, reviewedAt: new Date() },
      });
      if (changed.count !== 1) return false;
      await logAudit(req.user.id, "ACCOUNT_DELETION_REJECT", "ACCOUNT_DELETION_REQUEST", request.id, { userId: request.userId }, undefined, tx);
      return true;
    });
    if (!updated) return NextResponse.json({ error: "申请已处理" }, { status: 409 });
    await createNotification(request.userId, "SYSTEM", "账号注销申请未通过", parsed.data.note, "/settings/account").catch((error) => {
      console.error("Failed to notify rejected account deletion request", error);
    });
    return NextResponse.json({ status: "REJECTED" });
  }

  const evidenceKeys = await prisma.identityVerificationApplication.findMany({
    where: { applicantId: request.userId, evidenceKey: { not: null } },
    select: { evidenceKey: true },
  });
  const completed = await prisma.$transaction(async (tx) => {
    const changed = await tx.accountDeletionRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "COMPLETED", reviewNote: parsed.data.note, reviewerId: req.user.id,
        reviewedAt: new Date(), completedAt: new Date(),
      },
    });
    if (changed.count !== 1) return false;
    await tx.account.deleteMany({ where: { userId: request.userId } });
    await tx.session.deleteMany({ where: { userId: request.userId } });
    await tx.qQGrant.deleteMany({ where: { userId: request.userId } });
    await tx.qQDelegationDraft.deleteMany({ where: { ownerId: request.userId } });
    await tx.qQConversation.deleteMany({ where: { ownerId: request.userId } });
    await tx.qQIdentity.deleteMany({ where: { userId: request.userId } });
    await tx.pendingQQRegistration.deleteMany({ where: { userId: request.userId } });
    await tx.identityVerificationApplication.updateMany({
      where: { applicantId: request.userId },
      data: {
        evidenceKey: null, evidenceMime: null, evidenceSize: null, evidenceDeleteAfter: null,
        identityCiphertext: null, identityIv: null, identityAuthTag: null,
        identityKeyVersion: null, identityLookupHash: null,
      },
    });
    await tx.user.update({
      where: { id: request.userId },
      data: {
        name: null, email: null, username: null, emailVerified: null, image: null,
        nickname: "已注销用户", avatar: null, bio: null, qqNumber: null, phone: null,
        passwordHash: null, verifiedIdentityHash: null, realVerifiedAt: null, studentVerifiedAt: null,
        role: "USER", isBanned: true, banUntil: null, isMuted: false, muteUntil: null,
        isShadowBanned: false, isAnonymous: true,
        psychAccess: false, dcrAccess: false, dcrContributionAccess: false,
        dcrHelperAccess: false, dcrPledgeSigned: false, quizPassed: false,
        dmConsentVersion: 0, dmConsentAcceptedAt: null, profileCompletionRequired: false,
        deactivatedAt: new Date(), securityVersion: { increment: 1 },
      },
    });
    await logAudit(req.user.id, "ACCOUNT_DELETION_COMPLETE", "ACCOUNT_DELETION_REQUEST", request.id, { userId: request.userId }, undefined, tx);
    return true;
  });
  if (!completed) return NextResponse.json({ error: "申请已处理" }, { status: 409 });
  await Promise.allSettled(evidenceKeys.flatMap(({ evidenceKey }) => evidenceKey ? [deleteSensitiveObject(evidenceKey)] : []));
  return NextResponse.json({ status: "COMPLETED" });
}, "ADMIN");
