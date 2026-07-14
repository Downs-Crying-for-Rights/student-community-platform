import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const createSchema = z.object({
  text: z.string().min(5).max(500),
  options: z.array(z.string().min(1)).min(2).max(6),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE"]),
  answer: z.array(z.number().int().min(0)).min(1),
  score: z.number().int().min(1).max(10).optional().default(1),
  explanation: z.string().max(500).optional(),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const questions = await prisma.dcrQuizQuestion.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ questions });
}, "ADMIN");

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { text, options, type, answer, score, explanation } = parsed.data;
  // Validate answer indices are within options range
  if (answer.some((i) => i < 0 || i >= options.length)) {
    return NextResponse.json({ error: "答案索引超出选项范围" }, { status: 400 });
  }
  // Validate single choice has exactly 1 answer
  if (type === "SINGLE_CHOICE" && answer.length !== 1) {
    return NextResponse.json({ error: "单选题只能有1个正确答案" }, { status: 400 });
  }
  // Validate multi choice has at least 2 answers
  if (type === "MULTIPLE_CHOICE" && answer.length < 1) {
    return NextResponse.json({ error: "多选题至少需要1个正确答案" }, { status: 400 });
  }
  const question = await prisma.dcrQuizQuestion.create({
    data: { text, options, type, answer, score, explanation: explanation ?? null },
  });
  return NextResponse.json({ question }, { status: 201 });
}, "ADMIN");
