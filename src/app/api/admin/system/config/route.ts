import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const updateSchema = z.object({
  smsVerificationEnabled: z.boolean(),
}).strict();

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json(
    {
      smsVerificationEnabled: config?.smsVerificationEnabled ?? true,
      revision: config?.revision ?? 0,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}, "SUPER_ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      smsVerificationEnabled: parsed.data.smsVerificationEnabled,
      updatedById: req.user.id,
    },
    update: {
      smsVerificationEnabled: parsed.data.smsVerificationEnabled,
      updatedById: req.user.id,
      revision: { increment: 1 },
    },
  });
  await logAudit(req.user.id, AuditAction.SYSTEM_CONFIG_UPDATE, AuditTargetType.SYSTEM, "default", {
    smsVerificationEnabled: config.smsVerificationEnabled,
    revision: config.revision,
  });

  return NextResponse.json(config, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");
