import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { applyPunishment, recalculatePunishmentProjection, revokePunishment } from "@/lib/punishment-service";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const schema = z.object({ action: z.enum(["ban", "unban"]), shadowBan: z.boolean().default(false), reason: z.string().trim().min(1).max(500) });

// Compatibility endpoint for older admin clients. New callers use /punishments.
export const POST = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
  if (params.id === req.user.id) return NextResponse.json({ error: "不能处罚自己" }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "仅超级管理员可处罚超级管理员账号" }, { status: 403 });
  const type = parsed.data.shadowBan ? "POST_SHADOW_HIDE" : "ACCOUNT_BAN";
  try {
    if (parsed.data.action === "ban") {
      await applyPunishment({ userId: params.id, operatorId: req.user.id, type, reason: parsed.data.reason });
    } else {
      const active = await prisma.userPunishment.findMany({
        where: {
          userId: params.id,
          type: { in: parsed.data.shadowBan ? ["POST_SHADOW_HIDE"] : ["ACCOUNT_BAN", "TEMPORARY_BAN", "PERMANENT_BAN", "POST_SHADOW_HIDE"] },
          action: "APPLIED",
          revokedAt: null,
        },
        select: { id: true },
      });
      for (const punishment of active) await revokePunishment({ punishmentId: punishment.id, operatorId: req.user.id, reason: parsed.data.reason });
      if (active.length === 0) await recalculatePunishmentProjection(params.id);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_SUPER_ADMIN") {
      return NextResponse.json({ error: "不能封禁最后一个可用的超级管理员" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") {
      return NextResponse.json({ error: "已注销账号不能执行处罚操作" }, { status: 409 });
    }
    throw error;
  }
  await logAudit(req.user.id, parsed.data.action === "ban" ? "USER_BAN" : "USER_UNBAN", "USER", params.id, parsed.data);
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, email: true, nickname: true, isBanned: true, isShadowBanned: true, isMuted: true, banUntil: true, muteUntil: true } });
  return NextResponse.json({ user });
}, "ADMIN");
