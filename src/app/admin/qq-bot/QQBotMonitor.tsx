"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Inbox, Link2, MessageSquareText, RefreshCw, RotateCcw, Send, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OutboxStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "RETRY" | "FAILED";
type WorkerStatus = "ONLINE" | "OFFLINE" | "DISABLED";

interface QQBotEvent {
  id: string;
  kind: "INBOX" | "OUTBOX";
  reference: string;
  status: string;
  attempts: number | null;
  error: string | null;
  selfId: string | null;
  createdAt: string;
  updatedAt: string;
  latencyMs: number | null;
  nextAttemptAt: string | null;
}

interface QQBotData {
  generatedAt: string;
  hours: number;
  worker: {
    enabled: boolean;
    status: WorkerStatus;
    expectedSelfId: string | null;
    heartbeatAt: string | null;
    heartbeatMatches: boolean;
  };
  summary: {
    identities: number;
    activeConversations: number;
    activeDrafts: number;
    pendingGrants: number;
    inboxTotal: number;
    inboxPending: number;
    readyOutbox: number;
    staleOutbox: number;
    outbox: Record<OutboxStatus, number>;
    maxAttempts: number;
  };
  events: QQBotEvent[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const statusLabels: Record<string, string> = {
  PENDING: "待处理", PROCESSING: "处理中", DELIVERED: "已送达", RETRY: "等待重试",
  FAILED: "失败", PROCESSED: "已处理",
};

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function formatLatency(value: number | null): string {
  if (value == null) return "-";
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(1)} s`;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn(
    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
    status === "DELIVERED" || status === "PROCESSED" ? "bg-emerald-100 text-emerald-800" :
      status === "FAILED" ? "bg-red-100 text-red-800" :
        status === "RETRY" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700",
  )}>{statusLabels[status] ?? status}</span>;
}

export function QQBotMonitor() {
  const [data, setData] = useState<QQBotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hours, setHours] = useState("24");
  const [kind, setKind] = useState("ALL");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ hours, kind, page: String(page), pageSize: "50" });
      if (status && kind !== "INBOX") params.set("status", status);
      const response = await fetch(`/api/admin/qq-bot?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "获取机器人状态失败");
      setData(body); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取机器人状态失败");
    } finally {
      setLoading(false);
    }
  }, [hours, kind, page, status]);

  useEffect(() => { void load(); }, [load]);
  const resetPage = () => setPage(1);
  const worker = data?.worker;
  const summary = data?.summary;
  const workerLabel = worker?.status === "ONLINE" ? "在线" : worker?.status === "DISABLED" ? "已停用" : "失联";
  const cards = [
    ["已绑定账号", summary?.identities ?? 0, Users],
    ["进行中表单", summary?.activeConversations ?? 0, MessageSquareText],
    ["有效草稿", summary?.activeDrafts ?? 0, Inbox],
    ["待消费授权", summary?.pendingGrants ?? 0, Link2],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6" />QQ 机器人监控</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看 worker 在线状态、消息队列、委托流程和安全脱敏后的事件日志。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />刷新
        </Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card className={cn(
        "overflow-hidden border-l-4",
        worker?.status === "ONLINE" ? "border-l-emerald-500" : worker?.status === "DISABLED" ? "border-l-slate-400" : "border-l-red-500",
      )}>
        <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-start gap-3">
            <div className={cn("mt-0.5 rounded-full p-2", worker?.status === "ONLINE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
              {worker?.status === "ONLINE" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-lg font-semibold">Worker {workerLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {worker?.status === "ONLINE" ? "OneBot 身份已验证，worker 正在持续领取发送队列。" :
                  worker?.status === "DISABLED" ? "主站环境变量已关闭 QQ 机器人。" : "最近 30 秒未收到已验证 worker 的队列心跳。"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-right">
            <span className="text-muted-foreground">机器人 QQ</span><span className="font-mono">{worker?.expectedSelfId ?? "未配置"}</span>
            <span className="text-muted-foreground">最近心跳</span><span>{formatTime(worker?.heartbeatAt ?? null)}</span>
            <span className="text-muted-foreground">身份匹配</span><span>{worker?.heartbeatMatches ? "正常" : "未确认"}</span>
            <span className="text-muted-foreground">数据刷新</span><span>{formatTime(data?.generatedAt ?? null)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}
      </div>

      <Card><CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">消息队列</h2><p className="text-xs text-muted-foreground">当前可领取 {summary?.readyOutbox ?? 0} 条，卡住 {summary?.staleOutbox ?? 0} 条，最多尝试 {summary?.maxAttempts ?? 0} 次。</p></div>
          {(summary?.staleOutbox ?? 0) > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">检测到过期处理租约</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ["待发送", summary?.outbox.PENDING ?? 0, Clock3],
            ["处理中", summary?.outbox.PROCESSING ?? 0, Send],
            ["等待重试", summary?.outbox.RETRY ?? 0, RotateCcw],
            ["失败", summary?.outbox.FAILED ?? 0, AlertTriangle],
            ["已送达", summary?.outbox.DELIVERED ?? 0, CheckCircle2],
            ["入站未处理", summary?.inboxPending ?? 0, Inbox],
          ] as const).map(([label, value, Icon]) => <div key={label} className="rounded-lg border bg-muted/20 p-3"><Icon className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={hours} onChange={(event) => { setHours(event.target.value); resetPage(); }} className={selectClass} aria-label="日志时间范围">
            <option value="1">最近 1 小时</option><option value="24">最近 24 小时</option><option value="168">最近 7 天</option><option value="720">最近 30 天</option>
          </select>
          <select value={kind} onChange={(event) => { setKind(event.target.value); if (event.target.value === "INBOX") setStatus(""); resetPage(); }} className={selectClass} aria-label="日志方向">
            <option value="ALL">全部方向</option><option value="INBOX">用户消息</option><option value="OUTBOX">机器人通知</option>
          </select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }} disabled={kind === "INBOX"} className={selectClass} aria-label="发送状态">
            <option value="">全部发送状态</option><option value="PENDING">待发送</option><option value="PROCESSING">处理中</option><option value="RETRY">等待重试</option><option value="FAILED">失败</option><option value="DELIVERED">已送达</option>
          </select>
          <span className="ml-auto text-xs text-muted-foreground">共 {data?.pagination.total ?? 0} 条，正文及用户身份已隐藏</span>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5">方向</th><th className="px-3 py-2.5">状态</th><th className="px-3 py-2.5">安全引用</th><th className="px-3 py-2.5">尝试</th><th className="px-3 py-2.5">耗时</th><th className="px-3 py-2.5">错误/下次重试</th><th className="px-3 py-2.5">创建时间</th></tr></thead>
            <tbody>{data?.events.length ? data.events.map((event) => <tr key={`${event.kind}-${event.id}`} className="border-t align-top hover:bg-muted/20">
              <td className="px-3 py-3">{event.kind === "INBOX" ? "用户消息" : "机器人通知"}</td>
              <td className="px-3 py-3"><StatusBadge status={event.status} /></td>
              <td className="px-3 py-3 font-mono text-xs">{event.reference}{event.selfId ? <span className="block text-muted-foreground">bot {event.selfId}</span> : null}</td>
              <td className="px-3 py-3">{event.attempts ?? "-"}</td>
              <td className="px-3 py-3 font-mono text-xs">{formatLatency(event.latencyMs)}</td>
              <td className="max-w-[260px] px-3 py-3 text-xs"><span className={event.error ? "text-red-700" : "text-muted-foreground"}>{event.error ?? (event.nextAttemptAt ? `重试：${formatTime(event.nextAttemptAt)}` : "-")}</span></td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatTime(event.createdAt)}</td>
            </tr>) : <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">{loading ? "正在加载..." : "暂无符合条件的机器人事件"}</td></tr>}</tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={!data || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{page} / {data?.pagination.totalPages ?? 1}</span>
          <Button size="sm" variant="outline" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>
    </div>
  );
}
