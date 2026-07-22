import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const requestSchema = z.object({
  scope: z.enum(["STUDENT", "ALL"]),
  reason: z.string().trim().min(5, "请至少填写 5 个字的撤销原因").max(500),
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "参数校验失败" }, { status: 400 });

  try {
    const request = await prisma.$transaction(async (tx) => {
      const [user, pending] = await Promise.all([
        tx.user.findUnique({ where: { id: req.user.id }, select: { realVerifiedAt: true, studentVerifiedAt: true } }),
        tx.identityVerificationRevocationRequest.findFirst({ where: { userId: req.user.id, status: "PENDING" }, select: { id: true } }),
      ]);
      if (pending) throw new Error("PENDING_EXISTS");
      if (!user || (parsed.data.scope === "STUDENT" ? !user.studentVerifiedAt : !user.realVerifiedAt && !user.studentVerifiedAt)) {
        throw new Error("NOT_ELIGIBLE");
      }
      const created = await tx.identityVerificationRevocationRequest.create({
        data: { userId: req.user.id, scope: parsed.data.scope, reason: parsed.data.reason },
        select: { id: true, scope: true, status: true, reason: true, requestedAt: true },
      });
      await logAudit(req.user.id, AuditAction.IDENTITY_REVOCATION_REQUEST, AuditTargetType.IDENTITY_REVOCATION_REQUEST, created.id, {
        scope: created.scope,
      }, undefined, tx);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ revocationRequest: request }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "PENDING_EXISTS") return NextResponse.json({ error: "已有待审核的认证撤销申请" }, { status: 409 });
    if (error instanceof Error && error.message === "NOT_ELIGIBLE") return NextResponse.json({ error: "当前没有可撤销的对应认证标签" }, { status: 409 });
    throw error;
  }
}, undefined, { captureAllTelemetry: true });
