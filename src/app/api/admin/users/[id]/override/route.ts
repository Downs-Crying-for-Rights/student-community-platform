import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const overrideSchema = z.object({
  reputationScore: z.number().int().min(0).optional(),
  violationCount: z.number().int().min(0).optional(),
  psychAccess: z.boolean().optional(),
  dcrAccess: z.boolean().optional(),
  dcrPledgeSigned: z.boolean().optional(),
  quizPassed: z.boolean().optional(),
  onboardingDone: z.boolean().optional(),
  role: z.enum(["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"]).optional(),
}).strict();

const OVERRIDE_FIELDS = [
  "reputationScore", "violationCount", "psychAccess", "dcrAccess",
  "dcrPledgeSigned", "quizPassed", "onboardingDone", "role",
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

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateFields,
    });

    await logAudit(
      req.user.id,
      AuditAction.SUPER_ADMIN_OVERRIDE,
      AuditTargetType.USER,
      id,
      { beforeValues, afterValues },
    );

    return NextResponse.json({ user: updatedUser });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
