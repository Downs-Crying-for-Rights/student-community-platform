import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { nicknameSchema, emailSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

const profileSchema = z.object({
  nickname: nicknameSchema.nullable().optional(),
  bio: z.string().max(200).nullable().optional(),
  avatar: z.string().url().nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的 11 位手机号").nullable().optional(),
  reason: z.string().trim().min(1, "必须填写修改原因").max(500),
  ticketId: z.string().trim().min(1, "必须填写工单或事件编号").max(100),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "请至少修改一项资料",
});

const PROFILE_FIELDS = ["nickname", "bio", "avatar", "email", "phone"] as const;

export const PATCH = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "仅超级管理员可修改用户身份资料" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = profileSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, nickname: true, bio: true, avatar: true, email: true, phone: true },
    });
    if (!existing) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const text = [parsed.data.nickname, parsed.data.bio].filter(Boolean).join(" ");
    if (text) {
      const matches = await scanContent(text);
      if (matches.length > 0) {
        return NextResponse.json({ error: "用户资料包含敏感内容", matches }, { status: 400 });
      }
    }

    const changes = Object.fromEntries(PROFILE_FIELDS
      .filter((field) => parsed.data[field] !== undefined && parsed.data[field] !== existing[field])
      .map((field) => [field, parsed.data[field]]));
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: "资料没有变化" }, { status: 400 });
    }
    const beforeValues = Object.fromEntries(Object.keys(changes).map((field) => [field, existing[field as keyof typeof existing]]));

    const user = await prisma.$transaction(async (tx) => {
      const identityChanged = changes.email !== undefined || changes.phone !== undefined;
      const updated = await tx.user.update({
        where: { id },
        data: { ...changes, ...(identityChanged ? { securityVersion: { increment: 1 } } : {}) },
        select: { id: true, nickname: true, bio: true, avatar: true, email: true, phone: true, updatedAt: true },
      });
      await logAudit(req.user.id, identityChanged ? AuditAction.PHONE_EMERGENCY_CHANGE : AuditAction.ADMIN_PROFILE_CORRECT, AuditTargetType.USER, id, {
        beforeValues,
        afterValues: changes,
        category: "PROFILE",
        reason: parsed.data.reason,
        ticketId: parsed.data.ticketId,
      }, undefined, tx);
      return updated;
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "邮箱或手机号已被其他用户使用" }, { status: 409 });
    }
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
