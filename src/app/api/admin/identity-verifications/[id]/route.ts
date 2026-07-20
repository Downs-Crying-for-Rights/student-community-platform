import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { grantsStudentVerification, identityReviewSchema } from "@/lib/identity-verification";

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsed = identityReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { status, reviewNote } = parsed.data;
  if (status === "REJECTED" && !reviewNote) return NextResponse.json({ error: "拒绝时必须填写原因" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.identityVerificationApplication.findUnique({
        where: { id: context.params.id },
        select: { id: true, applicantId: true, method: true, status: true, identityLookupHash: true },
      });
      if (!application) throw new Error("NOT_FOUND");
      if (application.status !== "PENDING") throw new Error("NOT_PENDING");
      if (status === "APPROVED") {
        const requiredAction = application.method === "REAL_NAME_ID"
          ? AuditAction.IDENTITY_DETAILS_VIEW
          : AuditAction.IDENTITY_EVIDENCE_VIEW;
        const viewed = await tx.auditLog.findFirst({
          where: { operatorId: req.user.id, action: requiredAction, targetType: AuditTargetType.IDENTITY_APPLICATION, targetId: application.id },
          select: { id: true },
        });
        if (!viewed) throw new Error("MATERIAL_NOT_VIEWED");
      }
      if (status === "APPROVED" && application.identityLookupHash) {
        const duplicate = await tx.user.findFirst({
          where: { verifiedIdentityHash: application.identityLookupHash, id: { not: application.applicantId } },
          select: { id: true },
        });
        if (duplicate) throw new Error("IDENTITY_IN_USE");
      }
      const claimed = await tx.identityVerificationApplication.updateMany({
        where: { id: application.id, status: "PENDING" },
        data: {
          status, reviewNote: reviewNote || null, reviewerId: req.user.id, reviewedAt: new Date(),
          pendingApplicantId: null,
          evidenceDeleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        },
      });
      if (claimed.count !== 1) throw new Error("NOT_PENDING");
      if (status === "APPROVED") {
        const verifiedAt = new Date();
        await tx.user.update({
          where: { id: application.applicantId },
          data: {
            realVerifiedAt: verifiedAt,
            ...(grantsStudentVerification(application.method) ? { studentVerifiedAt: verifiedAt } : {}),
            ...(application.identityLookupHash ? { verifiedIdentityHash: application.identityLookupHash } : {}),
          },
        });
      }
      await logAudit(req.user.id, AuditAction.IDENTITY_APPLICATION_REVIEW, AuditTargetType.IDENTITY_APPLICATION, application.id, {
        applicantId: application.applicantId,
        method: application.method,
        decision: status,
      }, undefined, tx);
      return { applicantId: application.applicantId, method: application.method };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await createNotification(
      result.applicantId,
      "SYSTEM",
      status === "APPROVED" ? "身份认证已通过" : "身份认证未通过",
      status === "APPROVED"
        ? grantsStudentVerification(result.method) ? "你已获得真实用户和学生用户标签。" : "你已获得真实用户标签。"
        : `你的身份认证未通过${reviewNote ? `，原因：${reviewNote}` : ""}。`,
      "/settings/identity",
    ).catch((error) => console.error("Identity verification notification failed", error));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    if (error instanceof Error && error.message === "NOT_PENDING") return NextResponse.json({ error: "申请已被处理" }, { status: 409 });
    if (error instanceof Error && error.message === "IDENTITY_IN_USE") return NextResponse.json({ error: "该身份信息已用于其他账户" }, { status: 409 });
    if (error instanceof Error && error.message === "MATERIAL_NOT_VIEWED") return NextResponse.json({ error: "请先查看认证材料，再执行通过操作" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "该身份信息已用于其他账户" }, { status: 409 });
    console.error("Identity verification review failed", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN", { captureAllTelemetry: true });
