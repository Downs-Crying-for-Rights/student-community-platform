import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  text: z.string().min(5).max(500).optional(),
  options: z.array(z.string()).length(4).optional(),
  answer: z.number().int().min(0).max(3).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/admin/quiz/[id] — update question
 */
export const PATCH = withAuth(async (req: AuthenticatedRequest, ctx: { params: Record<string, string> }) => {
  if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }
  const { id } = ctx.params;
  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
    }
    const q = await prisma.quizQuestion.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ question: q });
  } catch {
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
});

/**
 * DELETE /api/admin/quiz/[id] — delete question
 */
export const DELETE = withAuth(async (req: AuthenticatedRequest, ctx: { params: Record<string, string> }) => {
  if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }
  try {
    await prisma.quizQuestion.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
});
