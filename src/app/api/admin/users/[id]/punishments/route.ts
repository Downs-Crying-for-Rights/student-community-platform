import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const GET = withAuth(async (_req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const punishments = await prisma.userPunishment.findMany({
      where: { userId: id },
      include: { operator: { select: { id: true, nickname: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ punishments });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
