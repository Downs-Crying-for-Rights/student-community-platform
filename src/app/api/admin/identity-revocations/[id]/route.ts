import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).optional(),
});

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.status === "REJECTED" && !parsed.data.reviewNote)) {
    return NextResponse.json({ error: "拒绝时必须填写审核说明" }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.identityVerificationRevocationRequest.findUnique({
        where: { id: context.params.id }, select: { id: true, userId: true, scope: true, status: true },
      });
      if (!request) throw new Error("NOT_FOUND");
      if (request.status !== "PENDING") throw new Error("NOT_PENDING");
      if (request.userId === req.user.id) throw new Error("SELF_REVIEW");
      const changed = await tx.identityVerificationRevocationRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: parsed.data.status, reviewNote: parsed.data.reviewNote || null, reviewerId: req.user.id, reviewedAt: new Date() },
      });
      if (changed.count !== 1) throw new Error("NOT_PENDING");
      if (parsed.data.status === "APPROVED") {
        await tx.user.update({
          where: { id: request.userId },
          data: request.scope === "STUDENT"
            ? { studentVerifiedAt: null }
            : { realVerifiedAt: null, studentVerifiedAt: null },
        });
      }
      await logAudit(req.user.id, AuditAction.IDENTITY_REVOCATION_REVIEW, AuditTargetType.IDENTITY_REVOCATION_REQUEST, request.id, {
        userId: request.userId, scope: request.scope, decision: parsed.data.status,
      }, undefined, tx);
      return { userId: request.userId, scope: request.scope };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await createNotification(
      result.userId, "SYSTEM",
      parsed.data.status === "APPROVED" ? "身份认证撤销申请已通过" : "身份认证撤销申请未通过",
      parsed.data.status === "APPROVED"
        ? result.scope === "STUDENT" ? "你的学生用户标签已撤销。" : "你的已实名和学生用户标签已撤销。"
        : `你的身份认证撤销申请未通过${parsed.data.reviewNote ? `，原因：${parsed.data.reviewNote}` : ""}。`,
      "/settings/identity",
    ).catch((error) => console.error("Identity revocation notification failed", error));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "申请不存在" }, { status: 404 });
    if (error instanceof Error && error.message === "NOT_PENDING") return NextResponse.json({ error: "申请已被处理" }, { status: 409 });
    if (error instanceof Error && error.message === "SELF_REVIEW") return NextResponse.json({ error: "不能审核自己的撤销申请" }, { status: 403 });
    throw error;
  }
}, "ADMIN", { captureAllTelemetry: true });
