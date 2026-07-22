import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { getDMConsentDocument } from "@/lib/dm-consent";
import { getChatMonitoringConsent } from "@/lib/chat-monitoring-consent";
import { getCommunityGuidelines } from "@/lib/community-guidelines";
import { getAccountDeletionNotice } from "@/lib/account-deletion-notice";

/**
 * GET /api/admin/site-content
 * 列出所有站点内容文档的 key 和 title（ADMIN+）
 */
export const GET = withAuth(async (_req: AuthenticatedRequest) => {
  await Promise.all([getDMConsentDocument(), getChatMonitoringConsent(), getCommunityGuidelines(), getAccountDeletionNotice()]);
  const items = await prisma.siteContent.findMany({
    select: { key: true, title: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
  return NextResponse.json({ items });
}, "ADMIN");

const createSchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "key 只能包含小写字母、数字和下划线"),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).optional().default(""),
});

/**
 * POST /api/admin/site-content
 * 创建新的站点内容文档（ADMIN+）
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const existing = await prisma.siteContent.findUnique({ where: { key: parsed.data.key } });
  if (existing) {
    return NextResponse.json({ error: "该 key 已存在" }, { status: 409 });
  }
  const item = await prisma.siteContent.create({
    data: { ...parsed.data, updatedBy: req.user.id },
  });
  return NextResponse.json({ content: item }, { status: 201 });
}, "ADMIN");
