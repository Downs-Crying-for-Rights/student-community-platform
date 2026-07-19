"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clipboard,
  Eraser,
  Info,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface TerminalResponse {
  content: string;
  size: number;
  modifiedAt: string | null;
  fetchedAt: string;
  error?: string;
}

interface MailLogDetail {
  status?: "SENT" | "PARTIAL" | "SKIPPED" | "FAILED";
  subject?: string;
  recipients?: string[];
  accepted?: string[];
  rejected?: string[];
  reason?: string;
  response?: string | null;
  messageId?: string | null;
  smtpHost?: string;
  smtpPort?: number;
  error?: { message?: string; code?: string | null; response?: string | null };
}

const LEVEL_CONFIG = {
  DEBUG: { icon: Bug, className: "text-slate-500 bg-slate-100 dark:bg-slate-800" },
  INFO: { icon: Info, className: "text-blue-600 bg-blue-100 dark:bg-blue-900/40" },
  WARN: { icon: AlertTriangle, className: "text-amber-600 bg-amber-100 dark:bg-amber-900/40" },
  ERROR: { icon: AlertCircle, className: "text-red-600 bg-red-100 dark:bg-red-900/40" },
} as const;

const LEVEL_TABS = ["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const;
const TERMINAL_SOURCES = [
  ["services", "应用 / PostgreSQL / Redis"],
  ["nginx-error", "Nginx 错误"],
  ["nginx-access", "Nginx 访问"],
  ["deployment", "部署过程"],
] as const;
const MAIL_STATUS_CONFIG = {
  SENT: { label: "成功", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  PARTIAL: { label: "部分成功", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  SKIPPED: { label: "已跳过", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  FAILED: { label: "失败", className: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
} as const;

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseMailDetail(value: string | null): MailLogDetail {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as MailLogDetail : {};
  } catch {
    return {};
  }
}

function MailLogCard({ log }: { log: LogEntry }) {
  const detail = parseMailDetail(log.detail);
  const status = detail.status ? MAIL_STATUS_CONFIG[detail.status] : null;
  return (
    <Card className="border-muted/50">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-blue-600" />
            <p className="truncate text-sm font-medium">{detail.subject || log.message}</p>
          </div>
          {status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>}
        </div>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <p className="break-all">收件人：{detail.recipients?.join("、") || "-"}</p>
          <p>时间：{new Date(log.createdAt).toLocaleString("zh-CN")}</p>
          {detail.accepted && detail.accepted.length > 0 && <p className="break-all text-emerald-700 dark:text-emerald-300">已接受：{detail.accepted.join("、")}</p>}
          {detail.rejected && detail.rejected.length > 0 && <p className="break-all text-red-700 dark:text-red-300">已拒绝：{detail.rejected.join("、")}</p>}
          {(detail.smtpHost || detail.smtpPort) && <p>SMTP：{detail.smtpHost || "-"}:{detail.smtpPort || "-"}</p>}
          {detail.messageId && <p className="break-all">Message-ID：{detail.messageId}</p>}
        </div>
        {(detail.error?.message || detail.error?.response || detail.response || detail.reason) && (
          <pre className={`max-h-32 overflow-auto whitespace-pre-wrap rounded p-2 text-xs ${detail.status === "FAILED" ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" : "bg-muted/50 text-muted-foreground"}`}>
            {detail.error?.response || detail.error?.message || detail.response || detail.reason}
            {detail.error?.code ? `\n错误码：${detail.error.code}` : ""}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function LiveTerminal() {
  const [source, setSource] = useState("services");
  const [content, setContent] = useState("");
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [modifiedAt, setModifiedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  const fetchOutput = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch(`/api/admin/terminal?source=${encodeURIComponent(source)}&lines=700`, {
        cache: "no-store",
      });
      const data = (await response.json()) as TerminalResponse;
      if (!response.ok) throw new Error(data.error || "读取服务器日志失败");
      setContent(data.content);
      setSize(data.size);
      setModifiedAt(data.modifiedAt);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取服务器日志失败");
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void fetchOutput(true);
    if (paused) return;
    const timer = window.setInterval(() => void fetchOutput(), 2000);
    return () => window.clearInterval(timer);
  }, [fetchOutput, paused]);

  useEffect(() => {
    if (!paused && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content, paused]);

  async function copyOutput() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-[#0b1020] shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-[#151b2e] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-3 w-3 rounded-full bg-red-400" />
            <i className="h-3 w-3 rounded-full bg-amber-400" />
            <i className="h-3 w-3 rounded-full bg-emerald-400" />
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
            <Terminal className="h-3.5 w-3.5" /> forum-production · 只读
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-8 rounded-md border border-slate-600 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
            aria-label="日志来源"
          >
            {TERMINAL_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Button size="sm" variant="ghost" className="h-8 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => setPaused((value) => !value)}>
            {paused ? <CirclePlay className="mr-1 h-4 w-4" /> : <CirclePause className="mr-1 h-4 w-4" />}
            {paused ? "继续" : "暂停"}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => void fetchOutput(true)} aria-label="立即刷新">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => { setPaused(true); setContent(""); }} aria-label="清空当前显示">
            <Eraser className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => void copyOutput()} aria-label="复制日志">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <div className="border-b border-red-900 bg-red-950/60 px-4 py-2 font-mono text-xs text-red-300">error: {error}</div>}
      <pre
        ref={outputRef}
        className="h-[58vh] min-h-[420px] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12px] leading-5 text-emerald-300 selection:bg-emerald-400/30"
      >
        {loading && !content ? "$ 正在连接日志流……" : content || "$ 当前来源暂无输出。部署采集器启动后会自动显示。"}
      </pre>
      <div className="flex items-center justify-between border-t border-slate-800 bg-[#101629] px-4 py-2 font-mono text-[10px] text-slate-500">
        <span>{paused ? "PAUSED" : "LIVE · 每 2 秒刷新"} · 最多显示 700 行 · 敏感字段自动脱敏</span>
        <span>{formatBytes(size)}{modifiedAt ? ` · ${new Date(modifiedAt).toLocaleString("zh-CN")}` : ""}</span>
      </div>
    </div>
  );
}

function StructuredLogs({ fixedSource }: { fixedSource?: string } = {}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState(fixedSource ?? "");
  const [searchText, setSearchText] = useState("");
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (levelFilter !== "ALL") params.set("level", levelFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchText) params.set("search", searchText);
      const response = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "获取日志失败");
      setLogs(data.logs);
      setTotal(data.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, levelFilter, sourceFilter, searchText]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {LEVEL_TABS.map((level) => (
            <button key={level} onClick={() => { setLevelFilter(level); setPage(1); }} className={`rounded-full px-3 py-1 text-xs font-medium ${levelFilter === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {level}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜索日志内容……" value={searchText} onChange={(event) => { setSearchText(event.target.value); setPage(1); }} className="h-8 pl-8 text-xs" />
          </div>
          {!fixedSource && <Input placeholder="来源" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }} className="h-8 w-36 text-xs" />}
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">暂无结构化日志记录</p>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            if (fixedSource === "mail") return <MailLogCard key={log.id} log={log} />;
            const config = LEVEL_CONFIG[log.level];
            const Icon = config.icon;
            return (
              <Card key={log.id} className="border-muted/50">
                <CardContent className="flex items-start gap-3 p-3">
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${config.className}`}><Icon className="h-3 w-3" />{log.level}</span>
                  <div className="min-w-0 flex-1">
                    <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{log.source}</span>
                    <p className="mt-1 break-words text-sm">{log.message}</p>
                    {log.detail && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs text-muted-foreground">{log.detail}</pre>}
                    <div className="mt-1 text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString("zh-CN")}{log.ip ? ` · IP: ${log.ip}` : ""}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages} · 共 {total} 条</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

function MailDeliveryLogs() {
  return (
    <div>
      <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground"><Mail className="h-4 w-4" />邮件投递记录</p>
        <p className="mt-1">记录收件人、主题、成功/部分成功/跳过/失败状态及 SMTP 响应；不记录邮件正文、授权码或密码。</p>
      </div>
      <StructuredLogs fixedSource="mail" />
    </div>
  );
}

export default function AdminLogsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">服务器控制台</h1>
          <p className="mt-1 text-xs text-muted-foreground">实时查看生产服务器输出；仅超级管理员可访问，不支持执行命令。</p>
        </div>
        <Tabs defaultValue="terminal">
          <TabsList className="mb-4">
            <TabsTrigger value="terminal">实时终端</TabsTrigger>
            <TabsTrigger value="structured">结构化日志</TabsTrigger>
            <TabsTrigger value="mail">邮件投递</TabsTrigger>
          </TabsList>
          <TabsContent value="terminal"><LiveTerminal /></TabsContent>
          <TabsContent value="structured"><StructuredLogs /></TabsContent>
          <TabsContent value="mail"><MailDeliveryLogs /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
