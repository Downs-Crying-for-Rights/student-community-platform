"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Bug,
  Info,
  AlertTriangle,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

/* ========== Types ========== */

interface LogEntry {
  id: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
  detail: string | null;
  ip: string | null;
  userId: string | null;
  createdAt: string;
}

/* ========== Constants ========== */

const LEVEL_CONFIG = {
  DEBUG: { icon: Bug, className: "text-slate-500 bg-slate-100 dark:bg-slate-800", label: "DEBUG" },
  INFO: { icon: Info, className: "text-blue-600 bg-blue-100 dark:bg-blue-900/40", label: "INFO" },
  WARN: { icon: AlertTriangle, className: "text-amber-600 bg-amber-100 dark:bg-amber-900/40", label: "WARN" },
  ERROR: { icon: AlertCircle, className: "text-red-600 bg-red-100 dark:bg-red-900/40", label: "ERROR" },
} as const;

const LEVEL_TABS = ["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const;

/* ========== Page ========== */

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (levelFilter !== "ALL") params.set("level", levelFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchText) params.set("search", searchText);

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError("仅超级管理员可查看系统日志");
          return;
        }
        setError("获取日志失败");
        return;
      }
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [page, levelFilter, sourceFilter, searchText]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function renderDetail(detail: string | null) {
    if (!detail) return null;
    try {
      const obj = JSON.parse(detail);
      return (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(obj, null, 2)}
        </pre>
      );
    } catch {
      return <p className="mt-1 text-xs text-muted-foreground">{detail}</p>;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">系统运行日志</h1>
            <p className="text-xs text-muted-foreground">
              共 {total} 条 · 仅超级管理员可查看
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-2">
          {/* Level tabs */}
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_TABS.map((level) => (
              <button
                key={level}
                onClick={() => { setLevelFilter(level); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  levelFilter === level
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Search + source filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索日志内容..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Input
              placeholder="来源 (auth/post/...)"
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className="w-36 h-8 text-xs"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Log list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">暂无日志记录</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => {
              const cfg = LEVEL_CONFIG[log.level];
              const Icon = cfg.icon;
              return (
                <Card key={log.id} className="border-muted/50">
                  <CardContent className="flex items-start gap-3 p-3">
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cfg.className}`}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                          {log.source}
                        </span>
                        {log.userId && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                            uid:{log.userId.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground break-words">{log.message}</p>
                      {renderDetail(log.detail)}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                        {log.ip && <span>IP: {log.ip}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">系统日志 · 超级管理员专属</p>
      </div>
    </div>
  );
}
