import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { z } from "zod";
import { applyPunishment } from "@/lib/punishment-service";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  type: z.enum(["WARNING", "TEMPORARY_MUTE", "PERMANENT_MUTE", "TEMPORARY_BAN", "PERMANENT_BAN"]),
  durationMinutes: z.number().int().min(1).max(525_600).optional(),
  reason: z.string().trim().min(1).max(500),
}).superRefine((value, context) => {
  const temporary = value.type === "TEMPORARY_MUTE" || value.type === "TEMPORARY_BAN";
  if (temporary !== Boolean(value.durationMinutes)) context.addIssue({ code: "custom", path: ["durationMinutes"], message: temporary ? "临时处罚必须填写时长" : "该处罚类型不能填写时长" });
});

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
        include: { operator: { select: { id: true, nickname: true } }, revokedBy: { select: { id: true, nickname: true } } },
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

export const POST = withAuth(async (req: AuthenticatedRequest, context) => {
  const { id } = await context.params;
  if (id === req.user.id) return NextResponse.json({ error: "不能处罚自己" }, { status: 400 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if ((target.role === "ADMIN" || target.role === "SUPER_ADMIN") && req.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "仅超级管理员可处罚管理员账号" }, { status: 403 });
  const expiresAt = parsed.data.durationMinutes ? new Date(Date.now() + parsed.data.durationMinutes * 60_000) : null;
  let punishment;
  try {
    punishment = await applyPunishment({ userId: id, operatorId: req.user.id, type: parsed.data.type, reason: parsed.data.reason, expiresAt });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_SUPER_ADMIN") {
      return NextResponse.json({ error: "不能封禁最后一个可用的超级管理员" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") {
      return NextResponse.json({ error: "已注销账号不能执行处罚操作" }, { status: 409 });
    }
    throw error;
  }
  await logAudit(req.user.id, "PUNISHMENT_APPLY", "USER", id, { punishmentId: punishment.id, type: punishment.type, expiresAt, reason: punishment.reason });
  return NextResponse.json({ punishment }, { status: 201 });
}, "ADMIN");
