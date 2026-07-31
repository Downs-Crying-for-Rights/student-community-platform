import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { PHONE_GATE_AREAS, parsePhoneRequiredAreas } from "@/lib/phone-policy-shared";

const updateSchema = z.object({
  smsVerificationEnabled: z.boolean().optional(),
  emailRegistrationEnabled: z.boolean().optional(),
  inviteRegistrationEnabled: z.boolean().optional(),
  qqRegistrationEnabled: z.boolean().optional(),
  registrationPhoneRequired: z.boolean().optional(),
  phoneRequiredAreas: z.object(Object.fromEntries(
    PHONE_GATE_AREAS.map((area) => [area, z.boolean()]),
  ) as Record<(typeof PHONE_GATE_AREAS)[number], z.ZodBoolean>).strict().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "至少需要修改一项配置");

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => {
  const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json(
    {
      smsVerificationEnabled: config?.smsVerificationEnabled ?? true,
      emailRegistrationEnabled: config?.emailRegistrationEnabled ?? true,
      inviteRegistrationEnabled: config?.inviteRegistrationEnabled ?? true,
      qqRegistrationEnabled: config?.qqRegistrationEnabled ?? true,
      registrationPhoneRequired: config?.registrationPhoneRequired ?? false,
      phoneRequiredAreas: parsePhoneRequiredAreas(config?.phoneRequiredAreas),
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

  if (parsed.data.registrationPhoneRequired !== undefined || parsed.data.qqRegistrationEnabled !== undefined) {
    const current = await prisma.systemConfig.findUnique({
      where: { id: "default" },
      select: { qqRegistrationEnabled: true, registrationPhoneRequired: true },
    });
    const nextPhoneRequired = parsed.data.registrationPhoneRequired ?? current?.registrationPhoneRequired ?? false;
    const nextQQEnabled = parsed.data.qqRegistrationEnabled ?? current?.qqRegistrationEnabled ?? true;
    if (nextPhoneRequired && nextQQEnabled) {
      return NextResponse.json({ error: "强制注册手机号时必须同时关闭 QQ 机器人注册" }, { status: 400 });
    }
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...parsed.data,
      updatedById: req.user.id,
    },
    update: {
      ...parsed.data,
      updatedById: req.user.id,
      revision: { increment: 1 },
    },
  });
  await logAudit(req.user.id, AuditAction.SYSTEM_CONFIG_UPDATE, AuditTargetType.SYSTEM, "default", {
    ...parsed.data,
    ...(parsed.data.phoneRequiredAreas ? { phoneRequiredAreas: parsePhoneRequiredAreas(config.phoneRequiredAreas) } : {}),
    revision: config.revision,
  });

  return NextResponse.json({
    ...config,
    phoneRequiredAreas: parsePhoneRequiredAreas(config.phoneRequiredAreas),
  }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");
