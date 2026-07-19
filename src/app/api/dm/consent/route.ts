import { NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getDMConsentStatus } from "@/lib/dm-consent";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const acceptSchema = z.object({ version: z.number().int().positive() }).strict();

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  return NextResponse.json(await getDMConsentStatus(req.user.id));
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = acceptSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  const current = await getDMConsentStatus(req.user.id);
  if (parsed.data.version !== current.version) {
    return NextResponse.json({ error: "授权文本已更新，请重新阅读", consent: current }, { status: 409 });
  }
  const acceptedAt = new Date();
  await prisma.user.update({
    where: { id: req.user.id },
    data: { dmConsentVersion: current.version, dmConsentAcceptedAt: acceptedAt },
  });
  await logAudit(req.user.id, "DM_CONSENT_ACCEPT", "SITE_CONTENT", "dm_consent", {
    version: current.version,
  });
  return NextResponse.json({ ...current, accepted: true, acceptedAt: acceptedAt.toISOString() });
});
