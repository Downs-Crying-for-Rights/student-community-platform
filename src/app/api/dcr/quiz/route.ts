import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { gradeQuiz } from "@/lib/dcr-quiz-data";
import { quizAnswerSchema } from "@/lib/validators";

// 注意：硬编码题库 pickRandomQuestions / QUIZ_QUESTIONS 仅作为 DB 题库不可用时的 fallback，
// 通过动态 import 按需加载，避免生产环境不必要的静态依赖。

/**
 * GET /api/dcr/quiz
 * Fetch 5 random quiz questions. No APPROVED case required —
 * quiz is the entry gate to DCR.
 * - quizPassed=true → 409 "已通过考核"
 * - Otherwise → 200 with 5 questions
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

    // Try DB questions first, fall back to hardcoded
    const dbQuestions = await prisma.quizQuestion.findMany({
      where: { active: true },
      take: 5,
    });

    let questions: { id: string; text: string; options: { key: string; label: string }[] }[];
    if (dbQuestions.length >= 5) {
      // Shuffle and pick 5 from DB
      const shuffled = dbQuestions.sort(() => Math.random() - 0.5).slice(0, 5);
      questions = shuffled.map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options.map((label, idx) => ({ key: String.fromCharCode(65 + idx), label })),
      }));
    } else {
      // Fallback to hardcoded questions — 仅作为 DB 题库不可用时的 fallback
      const { pickRandomQuestions } = await import("@/lib/dcr-quiz-data");
      questions = pickRandomQuestions(5).map(({ id, text, options }) => ({ id, text, options }));
    }

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

    // Build answer map: try DB first, fall back to hardcoded
    const { answers: userAnswers } = parsed.data;
    const questionIds = userAnswers.map((a) => a.questionId);

    const dbQs = await prisma.quizQuestion.findMany({
      where: { id: { in: questionIds } },
    });

    let matchedCount: number;
    let correctCount: number;

    if (dbQs.length >= 5) {
      // DB-based grading: convert to Map for O(1) lookup
      const dbQMap = new Map(dbQs.map((q) => [q.id, q]));
      matchedCount = dbQs.length;
      correctCount = 0;
      for (const a of userAnswers) {
        const q = dbQMap.get(a.questionId);
        const selectedIndex = a.selectedKey.charCodeAt(0) - "A".charCodeAt(0);
        if (q && selectedIndex === q.answer) correctCount++;
      }
    } else {
      // Fallback to hardcoded grading — 仅作为 DB 题库不可用时的 fallback
      const { QUIZ_QUESTIONS } = await import("@/lib/dcr-quiz-data");
      const questionMap = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q]));
      const matchedQuestions = userAnswers
        .map((a) => questionMap.get(a.questionId))
        .filter((q): q is NonNullable<typeof q> => q != null);

      if (matchedQuestions.length !== userAnswers.length) {
        return NextResponse.json({ error: "包含无效的题目 ID" }, { status: 400 });
      }

      const result = gradeQuiz(matchedQuestions, userAnswers);
      matchedCount = result.total;
      correctCount = result.score;
    }

    const total = matchedCount;
    const score = correctCount;
    const passed = score / total >= 0.8;

    if (passed) {
      // Mark quiz as passed and create access application for admin review
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { quizPassed: true },
        });
        // Check if application already exists
        const existing = await tx.accessApplication.findFirst({
          where: { applicantId: userId, type: "DCR", status: "PENDING" },
        });
        if (!existing) {
          await tx.accessApplication.create({
            data: {
              type: "DCR",
              status: "PENDING",
              applicantId: userId,
              pledgeText: "已通过入频考核，申请加入 DCR 互助区",
            },
          });
        }
      });
    }

    return NextResponse.json({ passed, score, total });
  } catch (error) {
    console.error("POST /api/dcr/quiz error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
