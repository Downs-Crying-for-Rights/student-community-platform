import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const tutorialSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  order: z.number().int().min(0).optional(),
});
const reorderSchema = z.object({ firstId: z.string().cuid(), secondId: z.string().cuid() });

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可管理教程" }, { status: 403 });
  }
  const chapters = await prisma.dcrTutorialChapter.findMany({
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ chapters });
}, "SUPER_ADMIN");

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可管理教程" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = tutorialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const maxOrder = await prisma.dcrTutorialChapter.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const chapter = await prisma.dcrTutorialChapter.create({
    data: { ...parsed.data, order: parsed.data.order ?? (maxOrder?.order ?? -1) + 1 },
  });
  return NextResponse.json({ chapter }, { status: 201 });
}, "SUPER_ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  const chapters = await prisma.dcrTutorialChapter.findMany({
    where: { id: { in: [parsed.data.firstId, parsed.data.secondId] } },
    select: { id: true, order: true },
  });
  if (chapters.length !== 2) return NextResponse.json({ error: "教程章节不存在" }, { status: 404 });
  const [first, second] = parsed.data.firstId === chapters[0].id ? chapters : [chapters[1], chapters[0]];
  await prisma.$transaction([
    prisma.dcrTutorialChapter.update({ where: { id: first.id }, data: { order: second.order } }),
    prisma.dcrTutorialChapter.update({ where: { id: second.id }, data: { order: first.order } }),
  ]);
  return NextResponse.json({ success: true });
}, "SUPER_ADMIN");
