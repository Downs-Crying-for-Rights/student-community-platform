"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import {
  NEED_MORE_INFO_TEMPLATE,
  APPROVED_TEMPLATE,
  REJECTION_TEMPLATES,
  type ReviewDecision,
} from "@/lib/dcr-review-rules";

/* ========== Types ========== */

interface CaseItem {
  id: string;
  category: string;
  formData: Record<string, unknown>;
  pledgeText: string;
  requestStatus: ReviewDecision;
  reviewNote: string | null;
  missingFields: string[];
  extractedFields: Record<string, string> | null;
  sensitiveHitCount: number;
  createdAt: string;
  submitter: { id: string; nickname: string | null } | null;
}

/* ========== Constants ========== */

const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课", FEES: "收费", WEEKENDS: "双休", OTHER: "其他",
  EARLY_START: "提前开学", NO_WEEKENDS: "不双休", EXTERNAL_TRAINING: "校外培训",
};

const TAB_OPTIONS: { value: ReviewDecision; label: string }[] = [
  { value: "PENDING", label: "待审核" },
  { value: "NEED_MORE_INFO", label: "需补充" },
  { value: "MANUAL_REVIEW", label: "人工审核" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
];

/* ========== Page ========== */

export default function DCRModPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewDecision>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases?requestStatus=${activeTab}`);
      if (!res.ok) throw new Error("获取列表失败");
      const data = await res.json();
      setCases(data.cases);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  async function handleUpdateStatus(caseId: string, newStatus: ReviewDecision, note?: string) {
    setActionLoading(caseId);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestStatus: newStatus,
          reviewNote: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "操作失败");
        return;
      }
      fetchCases();
    } catch {
      setError("网络错误");
    } finally {
      setActionLoading(null);
      setRejectingId(null);
      setReviewNote("");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4">
          <PrivacyBanner message="管理端审核操作均记录审计日志" />
        </div>

        <div className="flex items-center gap-2 mb-4">
          <h1 className="text-xl font-bold text-foreground">委托表审核</h1>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            仅管理员/版主
          </span>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setRejectingId(null); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : cases.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">暂无该状态的委托表</p>
        ) : (
          <div className="space-y-4">
            {cases.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-3 p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-sm font-medium">
                        {CATEGORY_LABELS[c.category] || c.category}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.submitter?.nickname || "匿名"} · {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.sensitiveHitCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          <AlertTriangle className="h-3 w-3" />
                          敏感 {c.sensitiveHitCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 抽取字段 */}
                  {c.extractedFields && Object.keys(c.extractedFields).length > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">抽取字段</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(c.extractedFields).map(([k, v]) => (
                          <p key={k} className="text-xs text-foreground">
                            <span className="text-muted-foreground">{k}:</span> {v}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 缺项清单 */}
                  {c.missingFields.length > 0 && (
                    <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/20">
                      <p className="flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400">
                        <AlertTriangle className="h-3 w-3" /> 缺项清单
                      </p>
                      <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                        {c.missingFields.join("、")}
                      </p>
                    </div>
                  )}

                  {/* 审核意见 */}
                  {c.reviewNote && (
                    <p className="text-xs text-muted-foreground italic">审核意见: {c.reviewNote}</p>
                  )}

                  {/* 操作按钮 */}
                  {(activeTab === "PENDING" || activeTab === "NEED_MORE_INFO" || activeTab === "MANUAL_REVIEW") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={actionLoading === c.id}
                        onClick={() => handleUpdateStatus(c.id, "APPROVED", APPROVED_TEMPLATE)}
                      >
                        {actionLoading === c.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={actionLoading === c.id}
                        onClick={() => handleUpdateStatus(c.id, "NEED_MORE_INFO", NEED_MORE_INFO_TEMPLATE + c.missingFields.join("、"))}
                      >
                        需补充
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === c.id}
                        onClick={() => handleUpdateStatus(c.id, "MANUAL_REVIEW", "管理员转人工审核")}
                      >
                        转人工
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === c.id}
                        onClick={() => {
                          if (rejectingId === c.id) {
                            handleUpdateStatus(c.id, "REJECTED", reviewNote || "管理员驳回");
                          } else {
                            setRejectingId(c.id);
                            setReviewNote("");
                          }
                        }}
                      >
                        驳回
                      </Button>
                    </div>
                  )}

                  {/* 驳回理由输入框 */}
                  {rejectingId === c.id && (
                    <div className="space-y-2 rounded-lg border p-3">
                      <Label htmlFor="rejectReason" className="text-xs">驳回理由</Label>
                      <Input
                        id="rejectReason"
                        placeholder="请输入驳回理由..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        {Object.entries(REJECTION_TEMPLATES).map(([key, text]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setReviewNote(text)}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/80"
                          >
                            {key === "onlyLink" ? "仅链接" : key === "tooShort" ? "字少" : key === "multiSchool" ? "多校" : key === "nonTuition" ? "非补课" : "态度句"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">AI 生成内容仅供参考</p>
      </div>
    </div>
  );
}
