"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Plus,
  UserX,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { EmptyState } from "@/components/shared/EmptyState";

/* ========== Types ========== */

type RequestStatus = "PENDING" | "NEED_MORE_INFO" | "APPROVED" | "REJECTED" | "MANUAL_REVIEW";

interface CaseItem {
  id: string;
  category: string;
  requestStatus: RequestStatus;
  reviewNote: string | null;
  missingFields: string[];
  sensitiveHitCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CasesResponse {
  cases: CaseItem[];
  total: number;
}

/* ========== Constants ========== */

const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
  EARLY_START: "提前开学",
  NO_WEEKENDS: "不双休",
  EXTERNAL_TRAINING: "校外培训",
};

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string; icon: typeof Clock }> = {
  PENDING: { label: "待审核", className: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200", icon: Clock },
  NEED_MORE_INFO: { label: "需补充", className: "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200", icon: HelpCircle },
  APPROVED: { label: "已通过", className: "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200", icon: CheckCircle2 },
  REJECTED: { label: "已驳回", className: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200", icon: XCircle },
  MANUAL_REVIEW: { label: "人工审核中", className: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200", icon: ShieldAlert },
};

const TAB_OPTIONS: { value: RequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "PENDING", label: "待审核" },
  { value: "NEED_MORE_INFO", label: "需补充" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
  { value: "MANUAL_REVIEW", label: "人工审核" },
];

/* ========== Page ========== */

export default function RequestsPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestStatus | "ALL">("ALL");

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "ALL") {
        params.set("requestStatus", activeTab);
      }
      const res = await fetch(`/api/cases?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取委托表列表失败");
        return;
      }
      const data: CasesResponse = await res.json();
      setCases(data.cases);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <PrivacyBanner message="委托表内容仅您自己和管理人员可见" />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">我的委托表</h1>
          <Button asChild size="sm">
            <Link href="/dcr/delegate">
              <Plus className="mr-1 h-4 w-4" />
              新建委托表
            </Link>
          </Button>
        </div>

        {/* Status Tabs */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
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
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : cases.length === 0 ? (
          <EmptyState
            icon={FileEdit}
            title="暂无委托表"
            description={activeTab === "ALL" ? "您还没有提交过委托表" : `没有${TAB_OPTIONS.find(t => t.value === activeTab)?.label}状态的委托表`}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dcr/delegate">新建委托表</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {cases.map((c) => {
              const statusConf = STATUS_CONFIG[c.requestStatus];
              const StatusIcon = statusConf.icon;
              return (
                <Card key={c.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {CATEGORY_LABELS[c.category] || c.category}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusConf.className}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConf.label}
                        </span>
                        {c.sensitiveHitCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            <AlertTriangle className="h-3 w-3" />
                            敏感 {c.sensitiveHitCount}
                          </span>
                        )}
                      </div>

                      {c.reviewNote && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                          {c.reviewNote}
                        </p>
                      )}

                      {c.missingFields.length > 0 && (
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          缺项: {c.missingFields.join("、")}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link href={`/dcr/tickets/${c.id}`}>详情 →</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          AI 生成内容仅供参考
        </p>
      </div>
    </div>
  );
}

// Re-export needed for testing
export { FileEdit } from "lucide-react";
