import { describe, it, expect } from "vitest";

/**
 * 新手引导页面逻辑测试
 *
 * 验证新手引导页面的核心逻辑：
 * - 测验答案验证（全部正确通过、部分正确不通过）
 * - 步骤导航（前进、后退、边界检查）
 * - 问题回答状态检查
 * - 步骤标题获取
 *
 * Validates: Requirements 15.3, 21.5, 7.3
 */

import {
  validateQuizAnswers,
  isAllQuestionsAnswered,
  getStepTitle,
  canGoNext,
  canGoPrev,
  QUIZ_QUESTIONS,
  TOTAL_STEPS,
  type QuizQuestion,
} from "../onboarding-helpers";

// ==================== validateQuizAnswers ====================

describe("validateQuizAnswers", () => {
  it("全部答对时 passed 为 true", () => {
    const answers: Record<number, number> = {};
    for (const q of QUIZ_QUESTIONS) {
      answers[q.id] = q.correctIndex;
    }
    const result = validateQuizAnswers(answers, QUIZ_QUESTIONS);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(QUIZ_QUESTIONS.length);
    expect(result.total).toBe(QUIZ_QUESTIONS.length);
  });

  it("全部答错时 passed 为 false", () => {
    const answers: Record<number, number> = {};
    for (const q of QUIZ_QUESTIONS) {
      // Pick a wrong answer
      answers[q.id] = (q.correctIndex + 1) % q.options.length;
    }
    const result = validateQuizAnswers(answers, QUIZ_QUESTIONS);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(0);
  });

  it("部分答对时 passed 为 false", () => {
    const answers: Record<number, number> = {};
    QUIZ_QUESTIONS.forEach((q, i) => {
      if (i === 0) {
        answers[q.id] = (q.correctIndex + 1) % q.options.length; // wrong
      } else {
        answers[q.id] = q.correctIndex; // correct
      }
    });
    const result = validateQuizAnswers(answers, QUIZ_QUESTIONS);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(QUIZ_QUESTIONS.length - 1);
  });

  it("没有回答任何问题时 correctCount 为 0", () => {
    const result = validateQuizAnswers({}, QUIZ_QUESTIONS);
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(0);
  });

  it("空题目列表时 passed 为 true（无题可答）", () => {
    const result = validateQuizAnswers({}, []);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(0);
    expect(result.total).toBe(0);
  });

  it("自定义题目列表验证正确", () => {
    const customQuestions: QuizQuestion[] = [
      { id: 100, question: "1+1=?", options: ["1", "2", "3"], correctIndex: 1 },
    ];
    const result = validateQuizAnswers({ 100: 1 }, customQuestions);
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(1);
  });
});

// ==================== isAllQuestionsAnswered ====================

describe("isAllQuestionsAnswered", () => {
  it("全部回答时返回 true", () => {
    const answers: Record<number, number> = {};
    for (const q of QUIZ_QUESTIONS) {
      answers[q.id] = 0;
    }
    expect(isAllQuestionsAnswered(answers, QUIZ_QUESTIONS)).toBe(true);
  });

  it("部分回答时返回 false", () => {
    const answers: Record<number, number> = {};
    if (QUIZ_QUESTIONS.length > 0) {
      answers[QUIZ_QUESTIONS[0].id] = 0;
    }
    if (QUIZ_QUESTIONS.length > 1) {
      expect(isAllQuestionsAnswered(answers, QUIZ_QUESTIONS)).toBe(false);
    }
  });

  it("没有回答时返回 false", () => {
    expect(isAllQuestionsAnswered({}, QUIZ_QUESTIONS)).toBe(false);
  });

  it("空题目列表时返回 true", () => {
    expect(isAllQuestionsAnswered({}, [])).toBe(true);
  });
});

// ==================== getStepTitle ====================

describe("getStepTitle", () => {
  it("步骤 0 返回平台介绍", () => {
    expect(getStepTitle(0)).toBe("平台介绍");
  });

  it("步骤 1 返回社区规范", () => {
    expect(getStepTitle(1)).toBe("社区规范");
  });

  it("步骤 2 返回基础操作指引", () => {
    expect(getStepTitle(2)).toBe("基础操作指引");
  });

  it("步骤 3 返回新手测验", () => {
    expect(getStepTitle(3)).toBe("新手测验");
  });

  it("无效步骤返回空字符串", () => {
    expect(getStepTitle(99)).toBe("");
  });
});

// ==================== Step Navigation ====================

describe("canGoNext", () => {
  it("步骤 0 可以前进", () => {
    expect(canGoNext(0)).toBe(true);
  });

  it("步骤 1 可以前进", () => {
    expect(canGoNext(1)).toBe(true);
  });

  it("步骤 2 可以前进", () => {
    expect(canGoNext(2)).toBe(true);
  });

  it("最后一步不能前进", () => {
    expect(canGoNext(TOTAL_STEPS - 1)).toBe(false);
  });
});

describe("canGoPrev", () => {
  it("步骤 0 不能后退", () => {
    expect(canGoPrev(0)).toBe(false);
  });

  it("步骤 1 可以后退", () => {
    expect(canGoPrev(1)).toBe(true);
  });

  it("最后一步可以后退", () => {
    expect(canGoPrev(TOTAL_STEPS - 1)).toBe(true);
  });
});

// ==================== QUIZ_QUESTIONS data integrity ====================

describe("QUIZ_QUESTIONS", () => {
  it("至少包含 3 道题目", () => {
    expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("每道题目都有有效的 correctIndex", () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
  });

  it("每道题目至少有 2 个选项", () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("题目 ID 唯一", () => {
    const ids = QUIZ_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
