import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const roleChangeSchema = z.object({
  role: z.enum(["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"]),
  reason: z.string().trim().min(1, "必须填写角色变更原因").max(500),
});

export const PATCH = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;

    const body = await req.json();
    const parsed = roleChangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { role: newRole, reason } = parsed.data;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (targetUser.role === newRole) {
      return NextResponse.json({ error: "角色未变更" }, { status: 400 });
    }

    if (targetUser.role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "仅超级管理员可修改超级管理员账号" }, { status: 403 });
    }

    // 仅 SUPER_ADMIN 可将用户角色设为 SUPER_ADMIN
    if (newRole === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "仅超级管理员可授予此角色" },
        { status: 403 },
      );
    }

    // SUPER_ADMIN 不可降级自身角色
    if (req.user.id === id && req.user.role === "SUPER_ADMIN" && newRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "不可降级自身角色" },
        { status: 403 },
      );
    }

    if (targetUser.role === "SUPER_ADMIN" && newRole !== "SUPER_ADMIN") {
      const superAdminCount = await prisma.user.count({ where: { role: "SUPER_ADMIN", isBanned: false } });
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "不能移除最后一个有效超级管理员" }, { status: 400 });
      }
    }

    const oldRole = targetUser.role;

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { role: newRole, securityVersion: { increment: 1 } },
        select: { id: true, email: true, nickname: true, role: true },
      });
      await logAudit(
        req.user.id,
        AuditAction.ROLE_CHANGE,
        AuditTargetType.USER,
        id,
        { oldRole, newRole, reason, priority: newRole === "SUPER_ADMIN" || oldRole === "SUPER_ADMIN" ? "HIGH" : "NORMAL" },
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
