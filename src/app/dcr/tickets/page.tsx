"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Clock,
  PlayCircle,
  HelpCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { EmptyState } from "@/components/shared/EmptyState";

/* ========== Constants & Types ========== */

export const CASE_STATUS_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "OPENED", label: "待处理" },
  { value: "IN_PROGRESS", label: "处理中" },
  { value: "NEED_MORE_INFO", label: "待补充" },
  { value: "CLOSED", label: "已关闭" },
] as const;

export type CaseStatusFilter = (typeof CASE_STATUS_OPTIONS)[number]["value"];

export const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; className: string; icon: typeof Clock }
> = {
  OPENED: {
    label: "待处理",
    className:
      "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "处理中",
    className:
      "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    icon: PlayCircle,
  },
  NEED_MORE_INFO: {
    label: "待补充",
    className:
      "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    icon: HelpCircle,
  },
  CLOSED: {
    label: "已关闭",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    icon: CheckCircle2,
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
};

export interface CaseListItem {
  id: string;
  category: string;
  status: string;
  createdAt: string;
  handler: { id: string; nickname: string | null } | null;
  submitter: { id: string; nickname: string | null } | null;
}

/* ========== Pure Functions (exported for testing) ========== */

/**
 * Returns the display label for a case status.
 */
export function getStatusLabel(status: string): string {
  return STATUS_BADGE_CONFIG[status]?.label ?? status;
}

/**
 * Returns the display label for a DCR category.
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * Formats a date string for display in the list.
 */
export function formatListDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Builds the API URL for fetching cases with optional status filter and pagination.
 */
export function buildCasesApiUrl(
  filter: CaseStatusFilter,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();
  if (filter !== "ALL") params.set("status", filter);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/api/cases?${params.toString()}`;
}

/* ========== Flow Guide Data ========== */

export const FLOW_STEPS = [
  { status: "OPENED", label: "待处理", description: "工单已创建，等待 Helper 接单" },
  { status: "IN_PROGRESS", label: "处理中", description: "Helper 已接单，正在处理" },
  { status: "NEED_MORE_INFO", label: "待补充", description: "需要提交者补充更多信息" },
  { status: "CLOSED", label: "已关闭", description: "工单已处理完毕" },
] as const;

export const FLOW_GUIDE_TEXTS = {
  admissionTitle: "准入审核",
  admissionDesc: "委托表 → 审核 → 考核 → 加入（四步流程，完成后获得 DCR 互助区访问权限）",
  ticketTitle: "工单互助流程",
  ticketDesc: "新建工单 → 等待接单 → 处理沟通 → 关闭（提交工单后由 Helper 接单处理）",
} as const;

/* ========== Page Component ========== */

const PAGE_SIZE = 20;

export default function TicketListPage() {
  const [filter, setFilter] = useState<CaseStatusFilter>("ALL");
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = buildCasesApiUrl(filter, page, PAGE_SIZE);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCases(data.cases ?? []);
        setTotal(data.total ?? 0);
      } else {
        setError("加载工单列表失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleFilterChange = (value: CaseStatusFilter) => {
    setFilter(value);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Flow Guide */}
        {showGuide && (
          <Card className="mb-6 border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30" data-testid="flow-guide">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  工单流程指引
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="rounded-full p-0.5 text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  aria-label="关闭流程引导"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Status Flow Steps */}
              <div className="mb-3 flex flex-wrap items-center gap-1 text-xs" role="list" aria-label="工单状态流转">
                {FLOW_STEPS.map((step, i) => (
                  <span key={step.status} className="flex items-center gap-1" role="listitem">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE_CONFIG[step.status]?.className ?? ""}`}
                      title={step.description}
                    >
                      {step.label}
                    </span>
                    {i < FLOW_STEPS.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-blue-400 dark:text-blue-500" aria-hidden="true" />
                    )}
                  </span>
                ))}
              </div>

              {/* Two-process explanation */}
              <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                <p>
                  <span className="font-medium">{FLOW_GUIDE_TEXTS.admissionTitle}：</span>
                  {FLOW_GUIDE_TEXTS.admissionDesc}
                </p>
                <p>
                  <span className="font-medium">{FLOW_GUIDE_TEXTS.ticketTitle}：</span>
                  {FLOW_GUIDE_TEXTS.ticketDesc}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">我的工单</h1>
          <Button asChild className="rounded-2xl" size="sm">
            <Link href="/dcr/tickets/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              新建工单
            </Link>
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto" role="tablist" aria-label="工单状态筛选">
          {CASE_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={filter === opt.value}
              onClick={() => handleFilterChange(opt.value)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState
            title="暂无工单"
            description="您还没有提交过工单"
            actionLabel="新建工单"
            actionHref="/dcr/tickets/new"
          />
        ) : (
          <>
            {/* Case Cards */}
            <div className="space-y-3">
              {cases.map((c) => {
                const badge = STATUS_BADGE_CONFIG[c.status];
                const BadgeIcon = badge?.icon ?? Clock;
                return (
                  <Link key={c.id} href={`/dcr/tickets/${c.id}`}>
                    <Card className="transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">
                              {getCategoryLabel(c.category)}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge?.className ?? ""}`}
                            >
                              <BadgeIcon className="h-3 w-3" aria-hidden="true" />
                              {getStatusLabel(c.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatListDate(c.createdAt)}</span>
                            {c.handler && (
                              <span>处理人: {c.handler.nickname ?? "未知"}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
