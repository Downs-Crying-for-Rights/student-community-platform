"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { EmptyState } from "@/components/shared/EmptyState";

/* ========== Types & Constants ========== */

export type TaskTab = "recommended" | "latest" | "urgent";

export const TAB_OPTIONS: { value: TaskTab; label: string }[] = [
  { value: "recommended", label: "推荐" },
  { value: "latest", label: "最新" },
  { value: "urgent", label: "紧急" },
];

export const URGENCY_CONFIG: Record<string, { label: string; className: string }> = {
  URGENT: {
    label: "紧急",
    className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  HIGH: {
    label: "高",
    className: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  },
  MEDIUM: {
    label: "中",
    className: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  },
  LOW: {
    label: "低",
    className: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "待领取",
  CLAIMED: "已领取",
  IN_PROGRESS: "进行中",
  EVIDENCE_PENDING: "待结案",
  COMPLETED: "已完成",
};

export interface TaskListItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  urgencyLevel: string;
  status: string;
  expectedHelpType: string;
  createdAt: string;
  requester: { id: string; nickname: string | null };
}

/* ========== Pure helpers ========== */

export function getUrgencyLabel(level: string): string {
  return URGENCY_CONFIG[level]?.label ?? level;
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function buildTasksApiUrl(tab: TaskTab, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    tab,
    page: String(page),
    pageSize: String(pageSize),
  });
  return `/api/dcr/tasks?${params.toString()}`;
}

/* ========== Page Component ========== */

const PAGE_SIZE = 20;

export default function TaskFeedPage() {
  const [activeTab, setActiveTab] = useState<TaskTab>("recommended");
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchTasks = useCallback(
    async (pageNum: number, tab: TaskTab, append: boolean) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const url = buildTasksApiUrl(tab, pageNum, PAGE_SIZE);
        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();
        const items: TaskListItem[] = data.tasks ?? [];

        setTasks((prev) => (append ? [...prev, ...items] : items));
        setHasMore(data.page * data.pageSize < data.total);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setTasks([]);
    setPage(1);
    setHasMore(true);
    fetchTasks(1, activeTab, false);
  }, [activeTab, fetchTasks]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchTasks(next, activeTab, true);
  };

  const handleTabChange = (tab: TaskTab) => {
    if (tab !== activeTab) setActiveTab(tab);
  };

  const handleClaim = async (taskId: string) => {
    setClaiming(taskId);
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}/claim`, { method: "POST" });
      if (res.ok) {
        // Refresh the list to reflect the status change
        setTasks([]);
        setPage(1);
        fetchTasks(1, activeTab, false);
      }
    } catch {
      // silently ignore
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">互助任务</h1>
          <Button asChild className="rounded-2xl" size="sm">
            <Link href="/dcr/tasks/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              发起求助
            </Link>
          </Button>
        </div>

        {/* Tab Buttons */}
        <div className="mb-6 flex gap-2" role="tablist" aria-label="任务排序">
          {TAB_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={activeTab === opt.value}
              onClick={() => handleTabChange(opt.value)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === opt.value
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
        ) : tasks.length === 0 ? (
          <EmptyState
            title="暂无任务"
            description="当前没有互助任务，快来发起第一个求助吧"
            actionLabel="发起求助"
            actionHref="/dcr/tasks/new"
          />
        ) : (
          <>
            {/* Task Cards */}
            <div className="space-y-3">
              {tasks.map((task) => {
                const urgency = URGENCY_CONFIG[task.urgencyLevel];
                return (
                  <Card key={task.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Title */}
                          <Link
                            href={`/dcr/tasks/${task.id}`}
                            className="text-sm font-medium text-foreground hover:underline line-clamp-1"
                          >
                            {task.title}
                          </Link>

                          {/* Badges row */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {/* Category badge */}
                            <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                              {getCategoryLabel(task.category)}
                            </span>

                            {/* Urgency badge */}
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${urgency?.className ?? ""}`}
                            >
                              {getUrgencyLabel(task.urgencyLevel)}
                            </span>

                            {/* Status */}
                            <span className="text-xs text-muted-foreground">
                              {getStatusLabel(task.status)}
                            </span>
                          </div>
                        </div>

                        {/* CTA area */}
                        <div className="flex shrink-0 items-center gap-2">
                          {task.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="rounded-2xl text-xs"
                              disabled={claiming === task.id}
                              onClick={(e) => {
                                e.preventDefault();
                                handleClaim(task.id);
                              }}
                            >
                              {claiming === task.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                "接下互助"
                              )}
                            </Button>
                          )}
                          <Link href={`/dcr/tasks/${task.id}`} aria-label={`查看 ${task.title} 详情`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Load More */}
            {loadingMore && (
              <div className="mt-4 flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
              </div>
            )}

            {hasMore && !loadingMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={handleLoadMore}>
                  加载更多
                </Button>
              </div>
            )}

            {!hasMore && tasks.length > 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                已经到底啦 ~
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
