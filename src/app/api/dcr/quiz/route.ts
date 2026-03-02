import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  pickRandomQuestions,
  gradeQuiz,
  QUIZ_QUESTIONS,
} from "@/lib/dcr-quiz-data";
import { quizAnswerSchema } from "@/lib/validators";

/**
 * GET /api/dcr/quiz
 * Fetch 5 random quiz questions for the authenticated user.
 * - quizPassed=true → 409 "已通过考核"
 * - No IN_PROGRESS Case → 403 "请先完成委托表审核"
 * - Otherwise → 200 with 5 questions (correctKey stripped)
 *
 * Validates: Requirements 6.2, 6.3, 7.1, 7.6, 8.1, 8.2, 8.5
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { quizPassed: true },
    });

    if (user?.quizPassed) {
      return NextResponse.json({ error: "已通过考核" }, { status: 409 });
    }

    const inProgressCase = await prisma.case.findFirst({
      where: { submitterId: userId, status: "IN_PROGRESS" },
    });

    if (!inProgressCase) {
      return NextResponse.json(
        { error: "请先完成委托表审核" },
        { status: 403 },
      );
    }

    const questions = pickRandomQuestions(5).map(({ id, text, options }) => ({
      id,
      text,
      options,
    }));

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("GET /api/dcr/quiz error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/dcr/quiz
 * Submit quiz answers and receive grading result.
 * - Validates body with quizAnswerSchema (exactly 5 answers)
 * - Matches submitted questionIds against QUIZ_QUESTIONS
 * - Grades via gradeQuiz; if passed → sets user.quizPassed = true
 * - Returns { passed, score, total, corrections? }
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5, 8.4
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const body = await req.json();
    const parsed = quizAnswerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { answers } = parsed.data;

    // Build a lookup map for the quiz questions
    const questionMap = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q]));

    // Match submitted questionIds to actual questions
    const matchedQuestions = answers
      .map((a) => questionMap.get(a.questionId))
      .filter((q): q is NonNullable<typeof q> => q != null);

    if (matchedQuestions.length !== answers.length) {
      return NextResponse.json(
        { error: "包含无效的题目 ID" },
        { status: 400 },
      );
    }

    const result = gradeQuiz(matchedQuestions, answers);

    if (result.passed) {
      await prisma.user.update({
        where: { id: userId },
        data: { quizPassed: true },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/dcr/quiz error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
