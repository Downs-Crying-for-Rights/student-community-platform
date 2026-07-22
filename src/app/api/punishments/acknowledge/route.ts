import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canAcknowledgePunishment } from "@/lib/punishment-service";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.punishmentId !== "string") return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const punishment = await prisma.userPunishment.findFirst({ where: { id: body.punishmentId, userId: req.user.id } });
  if (!punishment || !canAcknowledgePunishment(punishment)) return NextResponse.json({ error: "待确认处罚不存在" }, { status: 404 });
  if (!punishment.acknowledgedAt) await prisma.userPunishment.update({ where: { id: punishment.id }, data: { acknowledgedAt: new Date() } });
  return NextResponse.json({ acknowledged: true });
});
