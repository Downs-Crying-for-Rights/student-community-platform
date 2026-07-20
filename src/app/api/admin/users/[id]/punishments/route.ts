import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;
    const parsed = paginationSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
    const { page, pageSize } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const [punishments, total] = await Promise.all([
      prisma.userPunishment.findMany({
        where: { userId: id },
        include: { operator: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.userPunishment.count({ where: { userId: id } }),
    ]);
    return NextResponse.json(
      { punishments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
