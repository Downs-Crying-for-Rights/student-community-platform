import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const overrideSchema = z.object({
  violationCount: z.number().int().min(0).optional(),
  psychAccess: z.boolean().optional(),
  dcrAccess: z.boolean().optional(),
  dcrHelperAccess: z.boolean().optional(),
  dcrPledgeSigned: z.boolean().optional(),
  quizPassed: z.boolean().optional(),
  onboardingDone: z.boolean().optional(),
  reason: z.string().trim().min(1, "必须填写覆写原因").max(500),
}).strict();

const OVERRIDE_FIELDS = [
  "violationCount", "psychAccess", "dcrAccess", "dcrHelperAccess",
  "dcrPledgeSigned", "quizPassed", "onboardingDone",
] as const;

export const PATCH = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = overrideSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const updateFields: Record<string, unknown> = {};

    for (const field of OVERRIDE_FIELDS) {
      if (data[field] !== undefined) {
        updateFields[field] = data[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "无有效修改字段" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Record before values
    const beforeValues: Record<string, unknown> = {};
    const afterValues: Record<string, unknown> = {};
    for (const field of Object.keys(updateFields)) {
      beforeValues[field] = (targetUser as Record<string, unknown>)[field];
      afterValues[field] = updateFields[field];
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { ...updateFields, securityVersion: { increment: 1 } },
        select: {
        id: true,
        nickname: true,
        role: true,
        violationCount: true,
        psychAccess: true,
        dcrAccess: true,
        dcrHelperAccess: true,
        dcrPledgeSigned: true,
        quizPassed: true,
        onboardingDone: true,
        updatedAt: true,
        },
      });
      await logAudit(
        req.user.id, AuditAction.SUPER_ADMIN_OVERRIDE, AuditTargetType.USER, id,
        { beforeValues, afterValues, reason: data.reason } as unknown as Prisma.InputJsonValue,
        undefined, tx,
      );
      return updated;
    });

    return NextResponse.json({ user: updatedUser });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
