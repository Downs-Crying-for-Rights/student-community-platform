import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const createQuestionSchema = z.object({
  text: z.string().min(5, "题目至少5字").max(500),
  options: z.array(z.string()).length(4, "必须有4个选项"),
  answer: z.number().int().min(0).max(3, "正确答案索引0-3"),
});

/**
 * GET /api/admin/quiz
 * List all quiz questions (admin only).
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }

  const questions = await prisma.quizQuestion.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ questions });
});

/**
 * POST /api/admin/quiz
 * Create a new quiz question (admin only).
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅管理员可访问" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const q = await prisma.quizQuestion.create({
      data: parsed.data,
    });

    return NextResponse.json({ question: q }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/quiz error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
});
