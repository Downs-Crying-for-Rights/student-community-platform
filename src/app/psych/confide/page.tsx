"use client";

import { useState } from "react";
import {
  Headphones,
  Send,
  Users,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PsychLayout } from "@/components/psych/PsychLayout";

/* ========== Pure Helper Functions (exported for testing) ========== */

/**
 * Validates a confide request summary.
 * Returns an error message or empty string if valid.
 */
export function validateConfideSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length === 0) {
    return "请输入倾诉内容摘要";
  }
  if (trimmed.length < 10) {
    return "倾诉摘要至少需要 10 个字符";
  }
  if (trimmed.length > 500) {
    return "倾诉摘要不能超过 500 个字符";
  }
  return "";
}

/**
 * Returns the confide status display text.
 */
export function getConfideStatusText(status: string): string {
  switch (status) {
    case "WAITING":
      return "等待匹配中，请耐心等待倾听者领取";
    case "MATCHED":
      return "已匹配到倾听者，即将开始对话";
    case "ACTIVE":
      return "会话进行中";
    case "CLOSED":
      return "会话已结束";
    default:
      return "";
  }
}

/* ========== Page Component ========== */

export default function PsychConfidePage() {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = validateConfideSummary(summary);

  const handleSubmit = async () => {
    if (validationError) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/psych/confide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summary.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("提交失败，请稍后重试");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PsychLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
            <Headphones
              className="h-8 w-8 text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">倾诉匹配</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            提交倾诉请求，匹配一位倾听者进行一对一匿名对话
          </p>
        </div>

        {/* Submit Confide Request */}
        {!submitted ? (
          <Card className="mb-6 border-orange-100 dark:border-orange-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Send
                  className="h-5 w-5 text-orange-600 dark:text-orange-400"
                  aria-hidden="true"
                />
                提交倾诉请求
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                简要描述你想倾诉的内容，倾听者将看到摘要（不会看到你的身份信息）。
              </p>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="请描述你想倾诉的内容..."
                className="w-full rounded-xl border border-orange-200 bg-white p-3 text-sm placeholder:text-muted-foreground focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 dark:border-orange-800 dark:bg-orange-950/20 dark:focus:border-orange-600 dark:focus:ring-orange-600"
                rows={5}
                maxLength={500}
                aria-label="倾诉内容摘要"
              />
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {summary.trim().length > 0 && validationError
                    ? validationError
                    : ""}
                </span>
                <span>{summary.length}/500</span>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                  {error}
                </div>
              )}

              <Button
                className="mt-4 w-full rounded-2xl bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600"
                disabled={!!validationError || loading}
                onClick={handleSubmit}
                aria-label="提交倾诉请求"
              >
                {loading && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {loading ? "提交中..." : "提交倾诉请求"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-green-100 dark:border-green-900/30">
            <CardContent className="p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <MessageCircle
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </div>
              <p className="font-medium text-foreground">倾诉请求已提交</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getConfideStatusText("WAITING")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Listener Queue Section */}
        <Card className="border-orange-100 dark:border-orange-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users
                className="h-5 w-5 text-orange-600 dark:text-orange-400"
                aria-hidden="true"
              />
              倾听者队列
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              如果你是倾听者，可以在此查看待匹配的倾诉请求并领取。
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-orange-200 p-6 text-center dark:border-orange-800">
              <p className="text-sm text-muted-foreground">
                暂无待匹配的倾诉请求
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PsychLayout>
  );
}
