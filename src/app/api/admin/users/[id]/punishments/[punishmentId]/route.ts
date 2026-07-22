import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { revokePunishment } from "@/lib/punishment-service";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const schema = z.object({ reason: z.string().trim().min(1).max(500) });

export const DELETE = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "必须填写解除原因" }, { status: 400 });
  const existing = await prisma.userPunishment.findFirst({ where: { id: params.punishmentId, userId: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "处罚不存在" }, { status: 404 });
  try {
    const punishment = await revokePunishment({ punishmentId: existing.id, operatorId: req.user.id, reason: parsed.data.reason });
    await logAudit(req.user.id, "PUNISHMENT_REVOKE", "USER", params.id, { punishmentId: existing.id, reason: parsed.data.reason });
    return NextResponse.json({ punishment });
  } catch (error) {
    if (error instanceof Error && error.message === "PUNISHMENT_ALREADY_REVOKED") return NextResponse.json({ error: "处罚已解除" }, { status: 409 });
    throw error;
  }
}, "ADMIN");
