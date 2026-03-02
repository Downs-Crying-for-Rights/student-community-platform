"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  BookOpen,
  Shield,
  MousePointerClick,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  type QuizQuestion,
  QUIZ_QUESTIONS,
  validateQuizAnswers,
  isAllQuestionsAnswered,
  getStepTitle,
  TOTAL_STEPS,
  canGoNext,
  canGoPrev,
} from "./onboarding-helpers";

// ==================== Step Content Components ====================

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === currentStep
              ? "w-8 bg-primary"
              : i < currentStep
                ? "w-2 bg-primary/60"
                : "w-2 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function PlatformIntroStep() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold">欢迎来到学生交流社区</h3>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        这是一个面向学生群体的多层级社区平台，旨在为同学们提供安全、友好的交流空间。
      </p>
      <div className="space-y-3 mt-4">
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">🌐 公开区</h4>
          <p className="text-sm text-muted-foreground">
            娱乐、工具使用、AI 效率、基础编程等话题的自由讨论区，无需审核即可发帖。
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">💚 心理交流区</h4>
          <p className="text-sm text-muted-foreground">
            匿名同伴倾听与情绪支持空间，需通过准入审核。所有交流均匿名进行，保护你的隐私。
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">🔒 DCR 私密区</h4>
          <p className="text-sm text-muted-foreground">
            权益信息互助与合规工单流转区域，白名单准入，所有帖子先审后发。
          </p>
        </div>
      </div>
    </div>
  );
}

function CommunityGuidelinesStep() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold">社区规范</h3>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        为了维护良好的社区环境，请遵守以下规范：
      </p>
      <ul className="space-y-3 mt-4">
        <li className="flex items-start gap-3 rounded-xl border p-4">
          <span className="text-lg">🤝</span>
          <div>
            <h4 className="font-medium">尊重他人</h4>
            <p className="text-sm text-muted-foreground">
              保持友善和尊重，禁止人身攻击、歧视、骚扰等行为。
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-xl border p-4">
          <span className="text-lg">🔐</span>
          <div>
            <h4 className="font-medium">保护隐私</h4>
            <p className="text-sm text-muted-foreground">
              不要在帖子中分享他人或自己的真实姓名、学校名称、电话号码等个人可识别信息。
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-xl border p-4">
          <span className="text-lg">🚫</span>
          <div>
            <h4 className="font-medium">禁止违规内容</h4>
            <p className="text-sm text-muted-foreground">
              禁止发布钓鱼诱导、不当言论、虚假信息等违规内容。违规将受到限制或封禁处理。
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 rounded-xl border p-4">
          <span className="text-lg">📢</span>
          <div>
            <h4 className="font-medium">积极举报</h4>
            <p className="text-sm text-muted-foreground">
              发现违规内容请使用举报功能，帮助维护社区环境。
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}

function BasicOperationsStep() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
          <MousePointerClick className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold">基础操作指引</h3>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">📝 发帖</h4>
          <p className="text-sm text-muted-foreground">
            点击底部导航的&ldquo;发布&rdquo;按钮，选择分区和标签，上传图片并编写内容即可发帖。
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">💬 评论</h4>
          <p className="text-sm text-muted-foreground">
            在帖子详情页点击评论按钮，即可发表评论。支持楼中楼回复。
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">📋 板块浏览</h4>
          <p className="text-sm text-muted-foreground">
            通过发现页浏览热门话题和板块，找到感兴趣的内容分区。
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="font-medium mb-1">🚩 举报</h4>
          <p className="text-sm text-muted-foreground">
            发现违规内容时，点击帖子或评论的举报按钮，选择举报原因并提交。
          </p>
        </div>
      </div>
    </div>
  );
}

function QuizStep({
  answers,
  onAnswer,
  showResults,
  result,
}: {
  answers: Record<number, number>;
  onAnswer: (questionId: number, optionIndex: number) => void;
  showResults: boolean;
  result: { passed: boolean; correctCount: number; total: number } | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
          <CheckCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
        <h3 className="text-lg font-semibold">新手测验</h3>
      </div>
      <p className="text-muted-foreground text-sm">
        请回答以下问题，全部答对即可完成新手引导。
      </p>

      {showResults && result && !result.passed && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            答对 {result.correctCount}/{result.total} 题，请检查错误答案后重试。
          </p>
        </div>
      )}

      <div className="space-y-6">
        {QUIZ_QUESTIONS.map((q, qi) => {
          const isAnswered = answers[q.id] !== undefined;
          const isCorrect = showResults && answers[q.id] === q.correctIndex;
          const isWrong = showResults && isAnswered && answers[q.id] !== q.correctIndex;

          return (
            <div key={q.id} className="space-y-2">
              <p className="font-medium text-sm">
                {qi + 1}. {q.question}
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => {
                  const isSelected = answers[q.id] === oi;
                  let optionClass =
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors text-sm";

                  if (showResults) {
                    if (oi === q.correctIndex) {
                      optionClass +=
                        " border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20";
                    } else if (isSelected && isWrong) {
                      optionClass +=
                        " border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20";
                    }
                  } else if (isSelected) {
                    optionClass += " border-primary bg-primary/5";
                  } else {
                    optionClass += " hover:border-primary/50";
                  }

                  return (
                    <button
                      key={oi}
                      type="button"
                      className={optionClass}
                      onClick={() => !showResults && onAnswer(q.id, oi)}
                      disabled={showResults}
                      aria-label={`选项 ${String.fromCharCode(65 + oi)}: ${opt}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Main Onboarding Page ====================

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    passed: boolean;
    correctCount: number;
    total: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleAnswer(questionId: number, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    setShowResults(false);
    setQuizResult(null);
  }

  function handleNext() {
    if (canGoNext(step)) {
      setStep(step + 1);
    }
  }

  function handlePrev() {
    if (canGoPrev(step)) {
      setStep(step - 1);
    }
  }

  async function handleSubmitQuiz() {
    const result = validateQuizAnswers(answers, QUIZ_QUESTIONS);
    setQuizResult(result);
    setShowResults(true);

    if (!result.passed) return;

    // Quiz passed — call API to mark onboarding complete
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "提交失败，请重试");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请检查网络连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setAnswers({});
    setShowResults(false);
    setQuizResult(null);
  }

  const allAnswered = isAllQuestionsAnswered(answers, QUIZ_QUESTIONS);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">新手引导</CardTitle>
          <CardDescription>
            {getStepTitle(step)} — 第 {step + 1} 步，共 {TOTAL_STEPS} 步
          </CardDescription>
        </CardHeader>

        <CardContent>
          <StepIndicator currentStep={step} />

          {step === 0 && <PlatformIntroStep />}
          {step === 1 && <CommunityGuidelinesStep />}
          {step === 2 && <BasicOperationsStep />}
          {step === 3 && (
            <QuizStep
              answers={answers}
              onAnswer={handleAnswer}
              showResults={showResults}
              result={quizResult}
            />
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={!canGoPrev(step)}
            aria-label="上一步"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            上一步
          </Button>

          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={handleNext} aria-label="下一步">
              下一步
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : showResults && quizResult && !quizResult.passed ? (
            <Button onClick={handleRetry} aria-label="重新答题">
              重新答题
            </Button>
          ) : (
            <Button
              onClick={handleSubmitQuiz}
              disabled={!allAnswered || submitting}
              aria-label="提交测验"
            >
              {submitting ? "提交中..." : "提交测验"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
