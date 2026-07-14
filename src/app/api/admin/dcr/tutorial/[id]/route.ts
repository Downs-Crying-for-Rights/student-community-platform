import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可管理教程" }, { status: 403 });
  }
  const { id } = context.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "无有效修改字段" }, { status: 400 });
  }
  const chapter = await prisma.dcrTutorialChapter.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ chapter });
}, "SUPER_ADMIN");

export const DELETE = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可管理教程" }, { status: 403 });
  }
  const { id } = context.params;
  await prisma.dcrTutorialChapter.delete({ where: { id } });
  return NextResponse.json({ success: true });
}, "SUPER_ADMIN");
