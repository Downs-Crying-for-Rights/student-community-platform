// ==================== Quiz Types & Data ====================

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: "在社区中，以下哪种行为是被禁止的？",
    options: [
      "分享学习资源",
      "发布包含他人真实姓名的帖子",
      "在公开区发表技术讨论",
      "给他人的帖子点赞",
    ],
    correctIndex: 1,
  },
  {
    id: 2,
    question: "心理交流区的主要特点是什么？",
    options: [
      "所有帖子公开可见",
      "需要实名认证",
      "匿名发帖，保护隐私",
      "仅管理员可以发帖",
    ],
    correctIndex: 2,
  },
  {
    id: 3,
    question: "发现帖子中包含违规内容时，你应该怎么做？",
    options: [
      "忽略不管",
      "在评论区公开批评",
      "使用举报功能向版主反馈",
      "截图发到其他平台",
    ],
    correctIndex: 2,
  },
  {
    id: 4,
    question: "DCR 私密区发帖前需要完成什么步骤？",
    options: [
      "直接发帖即可",
      "通过四步向导并签署声明",
      "联系管理员代发",
      "支付费用后发帖",
    ],
    correctIndex: 1,
  },
];

// ==================== Pure Helper Functions ====================

export function validateQuizAnswers(
  answers: Record<number, number>,
  questions: QuizQuestion[],
): { passed: boolean; correctCount: number; total: number } {
  let correctCount = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) {
      correctCount++;
    }
  }
  return {
    passed: correctCount === questions.length,
    correctCount,
    total: questions.length,
  };
}

export function isAllQuestionsAnswered(
  answers: Record<number, number>,
  questions: QuizQuestion[],
): boolean {
  return questions.every((q) => answers[q.id] !== undefined);
}

export function getStepTitle(step: number): string {
  switch (step) {
    case 0:
      return "平台介绍";
    case 1:
      return "社区规范";
    case 2:
      return "基础操作指引";
    case 3:
      return "新手测验";
    default:
      return "";
  }
}

export const TOTAL_STEPS = 4;

export function canGoNext(step: number): boolean {
  return step < TOTAL_STEPS - 1;
}

export function canGoPrev(step: number): boolean {
  return step > 0;
}
