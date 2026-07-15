import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/onboarding/questions
 * 返回后台启用的平台新手指引题目。无启用题目时由前端使用内置兜底题。
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: {
        text: true,
        options: true,
        answer: true,
      },
    });

    return NextResponse.json(
      {
        questions: questions.map((question, index) => ({
          id: index + 1,
          question: question.text,
          options: question.options,
          correctIndex: question.answer,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/onboarding/questions error:", error);
    return NextResponse.json(
      { error: "新手指引题库加载失败" },
      { status: 500 },
    );
  }
}
