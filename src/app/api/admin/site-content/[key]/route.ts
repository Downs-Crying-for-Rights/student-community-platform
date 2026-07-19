import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { DM_CONSENT_KEY } from "@/lib/dm-consent";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
});

export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const { key } = context.params;
  const item = await prisma.siteContent.findUnique({ where: { key } });
  if (!item) {
    return NextResponse.json({ content: null });
  }
  return NextResponse.json({ content: item });
}, "ADMIN");

/**
 * DELETE /api/admin/site-content/[key]
 * 删除指定 key 的站点内容（ADMIN+）
 */
export const DELETE = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const { key } = context.params;
  if (key === DM_CONSENT_KEY) {
    return NextResponse.json({ error: "私信授权文本为系统必需内容，不能删除" }, { status: 400 });
  }
  await prisma.siteContent.deleteMany({ where: { key } });
  return NextResponse.json({ success: true });
}, "ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const { key } = context.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "无有效修改字段" }, { status: 400 });
  }
  const item = await prisma.siteContent.upsert({
    where: { key },
    update: {
      ...parsed.data,
      updatedBy: req.user.id,
      ...(key === DM_CONSENT_KEY ? { revision: { increment: 1 } } : {}),
    },
    create: { key, title: parsed.data.title ?? key, content: parsed.data.content ?? "", updatedBy: req.user.id },
  });
  return NextResponse.json({ content: item });
}, "ADMIN");
