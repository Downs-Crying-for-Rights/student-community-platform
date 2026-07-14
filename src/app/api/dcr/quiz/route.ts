import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const answerSchema = z.object({
  questionId: z.string(),
  selectedKeys: z.array(z.string()), // ["A","C"] for multi, ["A"] for single
});

const quizSubmitSchema = z.object({
  answers: z.array(answerSchema).min(1),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // 已拥有 DCR 权限的用户无需再考核
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
    });
    if (user?.dcrAccess) {
      return NextResponse.json({ completed: true, reason: "已拥有 DCR 访问权限" });
    }

    // 已有审核中申请的无需重复考核（避免多次提交）
    const pendingApp = await prisma.accessApplication.findFirst({
      where: { applicantId: userId, type: "DCR", status: { in: ["PENDING", "APPROVED"] } },
    });
    if (pendingApp) {
      return NextResponse.json({ completed: true, reason: "已有 DCR 准入申请在处理中" });
    }
    // Fetch 5 random active questions
    const all = await prisma.dcrQuizQuestion.findMany({
      where: { active: true },
      select: { id: true, text: true, options: true, type: true, score: true },
    });
    if (all.length < 5) {
      return NextResponse.json({ error: "题库题目不足，请联系管理员" }, { status: 503 });
    }
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const questions = all.slice(0, 5);
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("GET /api/dcr/quiz error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const body = await req.json();
    const parsed = quizSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { answers: userAnswers } = parsed.data;
    const questionIds = userAnswers.map((a) => a.questionId);
    
    const dbQs = await prisma.dcrQuizQuestion.findMany({
      where: { id: { in: questionIds } },
    });
    if (dbQs.length !== userAnswers.length) {
      return NextResponse.json({ error: "包含无效的题目 ID" }, { status: 400 });
    }
    
    const dbQMap = new Map(dbQs.map((q) => [q.id, q]));
    let totalScore = 0;
    let earnedScore = 0;
    const corrections: { questionId: string; text: string; userAnswer: string[]; correctAnswer: number[]; explanation?: string }[] = [];
    
    for (const a of userAnswers) {
      const q = dbQMap.get(a.questionId)!;
      totalScore += q.score;
      const selectedIndices = a.selectedKeys.map((k) => k.toUpperCase().charCodeAt(0) - "A".charCodeAt(0));
      const correctIndices = [...q.answer].sort();
      const userIndicesSort = [...selectedIndices].sort();
      
      const isCorrect = userIndicesSort.length === correctIndices.length &&
        userIndicesSort.every((v, i) => v === correctIndices[i]);
      
      if (isCorrect) {
        earnedScore += q.score;
      } else {
        corrections.push({
          questionId: q.id,
          text: q.text,
          userAnswer: a.selectedKeys,
          correctAnswer: q.answer,
          explanation: q.explanation ?? undefined,
        });
      }
    }
    
    const passed = totalScore > 0 && earnedScore / totalScore >= 0.8;
    
    if (passed) {
      // 仅标记考核通过，不自动创建申请。
      // 用户需填写委托表后由管理员审核放行。
      await prisma.user.update({
        where: { id: userId },
        data: { quizPassed: true },
      });
    }
    
    return NextResponse.json({
      passed,
      score: earnedScore,
      total: totalScore,
      corrections: corrections.length > 0 ? corrections : undefined,
    });
  } catch (error) {
    console.error("POST /api/dcr/quiz error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
