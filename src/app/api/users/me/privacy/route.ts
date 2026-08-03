import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const privacySchema = z.object({
  allowDirectMessages: z.boolean(),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { allowDirectMessages: true },
  });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  return NextResponse.json(user);
});

export const PATCH = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = privacySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { allowDirectMessages: parsed.data.allowDirectMessages },
    select: { allowDirectMessages: true },
  });
  await logAudit(req.user.id, "UPDATE_DM_PRIVACY", "USER", req.user.id, user);
  return NextResponse.json(user);
}, undefined, { captureAllTelemetry: true });
