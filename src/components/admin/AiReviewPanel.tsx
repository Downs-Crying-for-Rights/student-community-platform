"use client";

import { useState } from "react";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type TargetType = "POST" | "POST_REVISION" | "REPORT" | "CASE" | "DISPUTE" | "CHAT_ROOM";

interface Result {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  recommendation: "APPROVE" | "REJECT" | "NEED_MORE_INFO" | "MANUAL_REVIEW";
  categories: string[];
  summary: string;
  reasons: string[];
  evidence: Array<{ field: string; quote: string; category: string }>;
  missingInformation: string[];
  suggestedReason: string;
  requiresHumanReview: boolean;
}

const RISK_LABELS = { LOW: "低风险", MEDIUM: "中风险", HIGH: "高风险", CRITICAL: "严重风险" } as const;
const DECISION_LABELS = { APPROVE: "建议通过", REJECT: "建议驳回", NEED_MORE_INFO: "建议补充信息", MANUAL_REVIEW: "建议人工复核" } as const;

export function AiReviewPanel({ targetType, targetId, onUseReason }: {
  targetType: TargetType;
  targetId: string;
  onUseReason?: (reason: string) => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);

  async function review() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/ai/reviews/${targetType}/${targetId}`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI 审核失败");
      setResult(data.review?.result ?? null);
      setCached(Boolean(data.cached));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 审核失败");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed bg-violet-50/40 p-3 dark:bg-violet-950/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium"><Bot className="h-4 w-4 text-violet-600" />DeepSeek 审核建议</p>
            <p className="mt-1 text-xs text-muted-foreground">内容会在服务端脱敏；AI 结论不能替代人工审核。</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void review()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}生成建议
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium"><Bot className="h-4 w-4 text-violet-600" />DeepSeek 审核建议 {cached && <span className="text-xs font-normal text-muted-foreground">已复用</span>}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => void review()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新</Button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-background px-2 py-1">{RISK_LABELS[result.riskLevel]}</span>
        <span className="rounded-full bg-background px-2 py-1">{DECISION_LABELS[result.recommendation]}</span>
        <span className="rounded-full bg-background px-2 py-1">置信度 {Math.round(result.confidence * 100)}%</span>
        {result.requiresHumanReview && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">必须人工复核</span>}
      </div>
      <p>{result.summary}</p>
      {result.reasons.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      {result.missingInformation.length > 0 && <p className="text-xs text-amber-700">缺失信息：{result.missingInformation.join("；")}</p>}
      {result.suggestedReason && onUseReason && <Button type="button" size="sm" variant="secondary" onClick={() => onUseReason(result.suggestedReason)}>采用建议话术</Button>}
      <p className="text-[11px] text-muted-foreground">AI 输出可能有误，最终操作及责任由人工审核者确认。</p>
    </div>
  );
}
