import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const banSchema = z.object({
  action: z.enum(["ban", "unban"]),
  shadowBan: z.boolean().optional().default(false),
  reason: z.string().max(500).optional(),
});

export const POST = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;

    const body = await req.json();
    const parsed = banSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, shadowBan, reason } = parsed.data;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Prevent banning self
    if (id === req.user.id) {
      return NextResponse.json({ error: "不能封禁自己" }, { status: 400 });
    }

    let updateData: Record<string, boolean>;
    let auditAction: string;
    const punishmentReason = reason?.trim() || (action === "unban" ? "管理员解除处罚" : "管理员未填写处罚原因");

    if (action === "ban") {
      if (shadowBan) {
        updateData = { isShadowBanned: true };
        auditAction = AuditAction.SHADOW_BAN;
      } else {
        updateData = { isBanned: true };
        auditAction = AuditAction.USER_BAN;
      }
    } else {
      // unban — clear both flags
      updateData = { isBanned: false, isShadowBanned: false };
      auditAction = AuditAction.USER_UNBAN;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          nickname: true,
          isBanned: true,
          isShadowBanned: true,
        },
      });

      const punishmentRecords = action === "ban"
        ? [{
            userId: id,
            operatorId: req.user.id,
            type: shadowBan ? "POST_SHADOW_HIDE" as const : "ACCOUNT_BAN" as const,
            action: "APPLIED" as const,
            reason: punishmentReason,
          }]
        : [
            ...(targetUser.isBanned ? [{ userId: id, operatorId: req.user.id, type: "ACCOUNT_BAN" as const, action: "REVOKED" as const, reason: punishmentReason }] : []),
            ...(targetUser.isShadowBanned ? [{ userId: id, operatorId: req.user.id, type: "POST_SHADOW_HIDE" as const, action: "REVOKED" as const, reason: punishmentReason }] : []),
          ];
      if (punishmentRecords.length > 0) {
        await tx.userPunishment.createMany({ data: punishmentRecords });
      }

      await logAudit(
        req.user.id,
        auditAction,
        AuditTargetType.USER,
        id,
        { action, shadowBan, reason: punishmentReason },
        undefined,
        tx,
      );
      return updated;
    });

    return NextResponse.json({ user: updatedUser });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
