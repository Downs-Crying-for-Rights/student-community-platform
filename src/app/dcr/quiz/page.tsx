"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ========== Fallback Tutorial Data ========== */

interface TutorialChapter {
  title: string;
  paragraphs: string[];
}

const FALLBACK_TUTORIAL_CHAPTERS: TutorialChapter[] = [
  {
    title: "DCR 互助区规则",
    paragraphs: [
      "DCR 互助区是一个权益信息互助与合规工单流转空间。所有参与者需遵守平台规则，通过结构化表单提交互助请求。",
      "互助区采用四步流程：填写委托表 → 管理员审核 → 考核测试 → 加入互助队伍。每一步都有明确的要求和标准。",
      "工单内容应基于事实客观描述违规行为，不得包含谣言、侮辱性语言或夸大事实的内容。恶意提交虚假举报信息将导致互助资格被取消。",
    ],
  },
  {
    title: "隐私保护要求",
    paragraphs: [
      "平台遵循最小化数据原则，不收集不必要的敏感信息。所有工单内容须经脱敏处理，禁止包含可识别个人信息。",
      "严禁在工单中公开他人身份证号码、手机号码、家庭住址等个人隐私信息。违反隐私保护规定将受到严肃处理。",
      "如果系统检测到敏感信息，将阻止提交并高亮显示敏感内容位置，用户需修改后才能提交。",
    ],
  },
  {
    title: "委托表填写规范",
    paragraphs: [
      "委托表包含内容类型、学校信息、举报途径、详细描述、收费情况、诉求和确认信息七个区块，请如实填写。",
      "详细描述字段要求至少 20 字，以确保提供足够的信息用于后续处理。学校名称和地址是核实举报信息的关键依据，必须真实准确。",
      "提交前需勾选 3 项确认声明，包括信息真实性、隐私保护承诺和平台规则遵守。全部勾选后才能提交。",
    ],
  },
  {
    title: "合规行为准则",
    paragraphs: [
      "平台不组织、不指挥、不实施任何举报或对抗行动。平台不提供法律建议，仅提供信息互助与合规渠道说明。",
      "DCR 互助区主要处理学校违规补课、提前开学、不双休、校外培训机构违规等教育违规行为的举报。",
      "加入互助队伍后，保护当事人隐私和遵守平台规则是最基本的要求。违反将被取消资格，并可能承担相应法律责任。",
    ],
  },
];

/* ========== Types ========== */

interface QuizQuestionData {
  id: string;
  text: string;
  options: { key: string; label: string }[];
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  score: number;
}

interface QuizResult {
  passed: boolean;
  score: number;
  total: number;
  corrections?: Array<{
    questionId: string;
    text: string;
    userAnswer: string[];
    correctAnswer: number[];
    explanation?: string;
  }>;
}

type Phase = "tutorial" | "quiz" | "result";

/* ========== Helpers ========== */

/** Convert raw DB options (string[]) to keyed format, e.g. ["选项A","选项B"] → [{key:"A",label:"选项A"},...] */
function keyedOptions(raw: string[]): { key: string; label: string }[] {
  return raw.map((label, i) => ({ key: String.fromCharCode(65 + i), label }));
}

/** Parse API tutorial content (single string) into paragraphs */
function parseContentToParagraphs(content: string): string[] {
  const parts = content.split(/\n\s*\n/).filter((s) => s.trim());
  return parts.length > 0 ? parts : [content];
}

/** Convert answer index array to letter keys, e.g. [0,2] → "A、C" */
function indicesToKeys(indices: number[]): string {
  return indices.map((i) => String.fromCharCode(65 + i)).join("、");
}

/* ========== Page Component ========== */

export default function QuizPage() {
  const router = useRouter();
  const { data: session, update } = useSession();

  // Phase management
  const [phase, setPhase] = useState<Phase>("tutorial");

  // Tutorial state
  const [tutorialChapters, setTutorialChapters] = useState<TutorialChapter[]>([]);
  const [tutorialLoading, setTutorialLoading] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [readChapters, setReadChapters] = useState<Set<number>>(new Set());

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestionData[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Result state
  const [result, setResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [appStatusLoading, setAppStatusLoading] = useState(false);
  const [appStatus, setAppStatus] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  /* ---- Fetch tutorial on mount ---- */

  useEffect(() => {
    let cancelled = false;
    async function fetchTutorial() {
      try {
        const res = await fetch("/api/dcr/tutorial");
        if (!res.ok) throw new Error("tutorial fetch failed");
        const data = await res.json();
        if (!cancelled && data.chapters?.length) {
          const chapters: TutorialChapter[] = data.chapters.map(
            (ch: { title: string; content: string; order: number }) => ({
              title: ch.title,
              paragraphs: parseContentToParagraphs(ch.content),
            }),
          );
          setTutorialChapters(chapters);
        } else if (!cancelled) {
          setTutorialChapters(FALLBACK_TUTORIAL_CHAPTERS);
        }
      } catch {
        if (!cancelled) setTutorialChapters(FALLBACK_TUTORIAL_CHAPTERS);
      } finally {
        if (!cancelled) setTutorialLoading(false);
      }
    }
    fetchTutorial();
    return () => { cancelled = true; };
  }, []);

  /* ---- Tutorial handlers ---- */

  const markChapterRead = useCallback((index: number) => {
    setReadChapters((prev) => new Set(prev).add(index));
  }, []);

  const chapters = tutorialChapters.length > 0 ? tutorialChapters : FALLBACK_TUTORIAL_CHAPTERS;
  const allChaptersRead = readChapters.size === chapters.length;

  const goToChapter = (index: number) => {
    setCurrentChapter(index);
    markChapterRead(index);
  };

  const handlePrevChapter = () => {
    if (currentChapter > 0) goToChapter(currentChapter - 1);
  };

  const handleNextChapter = () => {
    if (currentChapter < chapters.length - 1) goToChapter(currentChapter + 1);
  };

  // Mark first chapter as read on initial render (after chapters load)
  if (phase === "tutorial" && readChapters.size === 0 && chapters.length > 0 && !tutorialLoading) {
    markChapterRead(0);
  }

  /* ---- Quiz handlers ---- */

  const fetchQuestions = async () => {
    setLoadingQuestions(true);
    setError(null);
    try {
      const res = await fetch("/api/dcr/quiz");
      if (!res.ok) {
        if (res.status === 409) {
          // Already passed — redirect to DCR entry
          router.push("/dcr");
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "获取题目失败，请稍后重试");
        return;
      }
      const data = await res.json();
      // Map raw options (string[]) to keyed format
      const mapped: QuizQuestionData[] = data.questions.map(
        (q: { id: string; text: string; options: string[]; type: string; score: number }) => ({
          id: q.id,
          text: q.text,
          options: keyedOptions(q.options),
          type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
          score: q.score,
        }),
      );
      setQuestions(mapped);
      setCurrentQuestion(0);
      setAnswers({});
      setPhase("quiz");
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleStartQuiz = () => {
    fetchQuestions();
  };

  const handleSelectAnswer = (questionId: string, key: string, questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE") => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (questionType === "SINGLE_CHOICE") {
        return { ...prev, [questionId]: [key] };
      }
      // MULTIPLE_CHOICE: toggle
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, [questionId]: next };
    });
  };

  const handlePrevQuestion = () => {
    if (currentQuestion > 0) setCurrentQuestion(currentQuestion - 1);
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) setCurrentQuestion(currentQuestion + 1);
  };

  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  const handleSubmitQuiz = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          selectedKeys: answers[q.id] ?? [],
        })),
      };
      const res = await fetch("/api/dcr/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "提交失败，请稍后重试");
        return;
      }
      const data: QuizResult = await res.json();
      setResult(data);
      setPhase("result");
      // Fetch application status if passed
      if (data.passed) {
        setAppStatusLoading(true);
        try {
          const statusRes = await fetch("/api/dcr/progress");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.progress?.dcrAccess) {
              setAppStatus("approved");
            } else {
              setAppStatus("pending");
            }
          }
        } catch {
          setAppStatus("pending");
        } finally {
          setAppStatusLoading(false);
        }
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- Result handlers ---- */

  const handleRetry = () => {
    setResult(null);
    setAppStatus(null);
    fetchQuestions();
  };

  /* ========== Render ========== */

  const chapter = chapters[currentChapter];

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/40">
            <BookOpen className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">DCR 互助区考核</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {phase === "tutorial" && "请先阅读教程内容，完成后即可开始答题"}
            {phase === "quiz" && `答题进度：${currentQuestion + 1} / ${questions.length}`}
            {phase === "result" && "考核结果"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}

        {/* ===== Tutorial Phase ===== */}
        {phase === "tutorial" && (
          <>
            {tutorialLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : (
              <>
                {/* Chapter progress */}
                <div className="mb-4 flex items-center gap-2">
                  {chapters.map((ch, i) => (
                    <button
                      key={ch.title}
                      onClick={() => goToChapter(i)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                        readChapters.has(i)
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      } ${i === currentChapter ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      aria-label={`第 ${i + 1} 章${readChapters.has(i) ? "（已读）" : ""}`}
                    >
                      {readChapters.has(i) ? "✓" : i + 1}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    已读 {readChapters.size} / {chapters.length}
                  </span>
                </div>

                {/* Chapter content */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">{chapter.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {chapter.paragraphs.map((p, i) => (
                        <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                          {p}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Chapter navigation */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevChapter}
                    disabled={currentChapter === 0}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                    上一章
                  </Button>

                  {currentChapter < chapters.length - 1 ? (
                    <Button onClick={handleNextChapter}>
                      下一章
                      <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStartQuiz}
                      disabled={!allChaptersRead || loadingQuestions}
                    >
                      {loadingQuestions && (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      开始答题
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ===== Quiz Phase ===== */}
        {phase === "quiz" && questions.length > 0 && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    第 {currentQuestion + 1} 题
                  </CardTitle>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-muted-foreground dark:bg-slate-800">
                    {questions[currentQuestion].type === "MULTIPLE_CHOICE" ? "多选题" : "单选题"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 font-medium text-foreground">
                  {questions[currentQuestion].text}
                </p>
                <div className="space-y-2">
                  {questions[currentQuestion].options.map((opt) => {
                    const selected = (answers[questions[currentQuestion].id] ?? []).includes(opt.key);
                    const isMulti = questions[currentQuestion].type === "MULTIPLE_CHOICE";
                    return (
                      <label
                        key={opt.key}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <input
                          type={isMulti ? "checkbox" : "radio"}
                          name={`question-${questions[currentQuestion].id}`}
                          value={opt.key}
                          checked={selected}
                          onChange={() =>
                            handleSelectAnswer(
                              questions[currentQuestion].id,
                              opt.key,
                              questions[currentQuestion].type,
                            )
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">
                          {opt.key}. {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Question navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handlePrevQuestion}
                disabled={currentQuestion === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                上一题
              </Button>

              {currentQuestion < questions.length - 1 ? (
                <Button onClick={handleNextQuestion}>
                  下一题
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmitQuiz}
                  disabled={!allAnswered || submitting}
                >
                  {submitting && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  提交答案
                </Button>
              )}
            </div>

            {/* Answer progress dots */}
            <div className="mt-4 flex items-center justify-center gap-2">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    (answers[q.id]?.length ?? 0) > 0
                      ? "bg-primary"
                      : "bg-slate-200 dark:bg-slate-700"
                  } ${i === currentQuestion ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  aria-label={`第 ${i + 1} 题${(answers[q.id]?.length ?? 0) > 0 ? "（已答）" : "（未答）"}`}
                />
              ))}
            </div>
          </>
        )}

        {/* ===== Result Phase ===== */}
        {phase === "result" && result && (
          <>
            {/* Score card */}
            <Card className="mb-6">
              <CardContent className="py-8 text-center">
                {result.passed ? (
                  <>
                    <CheckCircle2
                      className="mx-auto mb-4 h-16 w-16 text-green-500"
                      aria-hidden="true"
                    />
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      考核通过
                    </p>
                  </>
                ) : (
                  <>
                    <XCircle
                      className="mx-auto mb-4 h-16 w-16 text-red-500"
                      aria-hidden="true"
                    />
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">
                      考核未通过
                    </p>
                  </>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  得分：{result.score} / {result.total}
                </p>
              </CardContent>
            </Card>

            {/* Corrections for failed quiz */}
            {!result.passed && result.corrections && result.corrections.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">错题解析</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {result.corrections.map((c) => {
                      const q = questions.find((q) => q.id === c.questionId);
                      return (
                        <div
                          key={c.questionId}
                          className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-950/20"
                        >
                          {q && (
                            <p className="mb-1 text-sm font-medium text-foreground">
                              {q.text}
                            </p>
                          )}
                          <p className="text-sm text-red-600 dark:text-red-400">
                            你的答案：{c.userAnswer.length > 0 ? c.userAnswer.join("、") : "未作答"}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-400">
                            正确答案：{indicesToKeys(c.correctAnswer)}
                          </p>
                          {c.explanation && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {c.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-3">
              {result.passed ? (
                <>
                  <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                    <p className="font-medium">考核通过！</p>
                    <p className="mt-1 text-xs">下一步：填写委托表并提交，管理员审核通过后即可开通 DCR 专区访问权限。</p>
                  </div>
                  <Button onClick={() => router.push("/dcr/delegate")}>
                    填写委托表
                    <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <Button onClick={handleRetry}>
                  重新答题
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
