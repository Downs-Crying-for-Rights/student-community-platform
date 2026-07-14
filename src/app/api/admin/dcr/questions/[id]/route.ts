import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  text: z.string().min(5).max(500).optional(),
  options: z.array(z.string().min(1)).min(2).max(6).optional(),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]).optional(),
  answer: z.array(z.number().int().min(0)).min(1).optional(),
  score: z.number().int().min(1).max(10).optional(),
  explanation: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const { id } = context.params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "无有效修改字段" }, { status: 400 });
  }
  // Validate answer indices
  if (parsed.data.answer) {
    const existing = await prisma.dcrQuizQuestion.findUnique({ where: { id }, select: { options: true, type: true } });
    const opts = parsed.data.options ?? existing?.options ?? [];
    const qtype = parsed.data.type ?? existing?.type ?? "SINGLE_CHOICE";
    if (parsed.data.answer.some((i) => i < 0 || i >= opts.length)) {
      return NextResponse.json({ error: "答案索引超出选项范围" }, { status: 400 });
    }
    if (qtype === "SINGLE_CHOICE" && parsed.data.answer.length !== 1) {
      return NextResponse.json({ error: "单选题只能有1个正确答案" }, { status: 400 });
    }
  }
  const question = await prisma.dcrQuizQuestion.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ question });
}, "ADMIN");

export const DELETE = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const { id } = context.params;
  await prisma.dcrQuizQuestion.delete({ where: { id } });
  return NextResponse.json({ success: true });
}, "ADMIN");
