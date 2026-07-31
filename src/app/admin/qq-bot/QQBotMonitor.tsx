"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink,
  Inbox, KeyRound, Link2, MessageSquareText, Power, RefreshCw, RotateCcw, Send, Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type OutboxStatus = "PENDING" | "PROCESSING" | "DELIVERED" | "RETRY" | "FAILED";
type WorkerStatus = "ONLINE" | "WORKER_OFFLINE" | "ONEBOT_OFFLINE" | "ACCOUNT_OFFLINE" | "DISABLED";

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
    oneBotConnected: boolean;
    accountOnline: boolean;
    accountCheckedAt: string | null;
  };
  operation: {
    commandId: string;
    action: "RESTART_WORKER" | "RESTART_NAPCAT" | "REFRESH_LOGIN";
    status: "RUNNING" | "SUCCEEDED" | "FAILED";
    updatedAt: string;
    message: string;
    hasLoginCredentials: boolean;
  } | null;
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

interface LoginCredentials {
  isLogin: boolean;
  isOffline: boolean;
  qrcode: string | null;
  captchaUrl: string | null;
  deviceVerificationUrl: string | null;
  loginError: string | null;
  smsSupported: false;
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
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<LoginCredentials | null>(null);

  const loadDetail = async (id: string, kind: "INBOX" | "OUTBOX") => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/qq-bot/events/${encodeURIComponent(id)}?kind=${kind}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "读取原文失败");
      setDetail(body.event);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取原文失败");
    } finally {
      setDetailLoading(false);
    }
  };

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

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const resetPage = () => setPage(1);
  const runOperation = async (action: "RESTART_WORKER" | "RESTART_NAPCAT" | "REFRESH_LOGIN", label: string) => {
    if (!window.confirm(`确认${label}？该操作会写入审计日志。`)) return;
    setOperationLoading(action);
    setCredentials(null);
    try {
      const response = await fetch("/api/admin/qq-bot/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirmation: "CONFIRM" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "提交修复操作失败");
      setError("");
      const commandId = body.command?.id as string | undefined;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        const params = new URLSearchParams({ hours, kind, page: String(page), pageSize: "50" });
        if (status && kind !== "INBOX") params.set("status", status);
        const statusResponse = await fetch(`/api/admin/qq-bot?${params}`, { cache: "no-store" });
        const statusBody = await statusResponse.json();
        if (!statusResponse.ok) continue;
        setData(statusBody);
        const operation = statusBody.operation;
        if (operation?.commandId !== commandId || operation.status === "RUNNING") continue;
        if (operation.status === "FAILED") throw new Error(operation.message || "修复操作失败");
        if (action === "REFRESH_LOGIN" && operation.hasLoginCredentials) {
          const credentialsResponse = await fetch("/api/admin/qq-bot/credentials", { cache: "no-store" });
          const credentialsBody = await credentialsResponse.json();
          if (credentialsResponse.ok) setCredentials(credentialsBody.login);
        }
        return;
      }
      throw new Error("Worker 操作超时，请检查机器人状态");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交修复操作失败");
    } finally {
      setOperationLoading(null);
    }
  };
  const revealCredentials = async () => {
    setOperationLoading("CREDENTIALS");
    try {
      const response = await fetch("/api/admin/qq-bot/credentials", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "读取登录凭证失败");
      setCredentials(body.login); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取登录凭证失败");
    } finally {
      setOperationLoading(null);
    }
  };
  const worker = data?.worker;
  const summary = data?.summary;
  const operationRunning = data?.operation?.status === "RUNNING";
  const workerLabel = worker?.status === "ONLINE" ? "完全在线" : worker?.status === "DISABLED" ? "已停用" :
    worker?.status === "ACCOUNT_OFFLINE" ? "QQ 账号已掉线" : worker?.status === "ONEBOT_OFFLINE" ? "OneBot 已断开" : "Worker 失联";
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
          <p className="mt-1 text-sm text-muted-foreground">分别检测 Worker、OneBot 和 QQ 账号登录状态，每 15 秒自动刷新。</p>
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
              <p className="text-lg font-semibold">机器人状态：{workerLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {worker?.status === "ONLINE" ? "Worker、OneBot 和 QQ 登录状态均正常。" :
                  worker?.status === "DISABLED" ? "主站环境变量已关闭 QQ 机器人。" :
                    worker?.status === "ACCOUNT_OFFLINE" ? "OneBot 仍可连接，但 QQ 返回账号离线；请重新登录机器人 QQ。" :
                      worker?.status === "ONEBOT_OFFLINE" ? "Worker 正常上报，但无法连接 OneBot。" : "最近 30 秒未收到 worker 状态心跳。"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-right">
            <span className="text-muted-foreground">机器人 QQ</span><span className="font-mono">{worker?.expectedSelfId ?? "未配置"}</span>
            <span className="text-muted-foreground">最近心跳</span><span>{formatTime(worker?.heartbeatAt ?? null)}</span>
            <span className="text-muted-foreground">Worker</span><span>{worker?.heartbeatMatches ? "在线" : "失联"}</span>
            <span className="text-muted-foreground">OneBot</span><span className={worker?.oneBotConnected ? "text-emerald-700" : "text-red-700"}>{worker?.oneBotConnected ? "已连接" : "已断开"}</span>
            <span className="text-muted-foreground">QQ 账号</span><span className={worker?.accountOnline ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{worker?.accountOnline ? "在线" : "已掉线"}</span>
            <span className="text-muted-foreground">账号检查</span><span>{formatTime(worker?.accountCheckedAt ?? null)}</span>
            <span className="text-muted-foreground">数据刷新</span><span>{formatTime(data?.generatedAt ?? null)}</span>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="flex items-center gap-2 font-semibold"><Power className="h-4 w-4" />机器人修复</h2><p className="mt-1 text-xs text-muted-foreground">仅超级管理员可用。操作通过固定命令通道执行，不授予主站 Docker 权限。</p></div>
          {data?.operation && <span className={cn("rounded-full px-3 py-1 text-xs font-medium", data.operation.status === "SUCCEEDED" ? "bg-emerald-100 text-emerald-800" : data.operation.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800")}>{data.operation.message}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={Boolean(operationLoading) || operationRunning} onClick={() => void runOperation("RESTART_WORKER", "重启 Worker")}><RotateCcw className="mr-2 h-4 w-4" />重启 Worker</Button>
          <Button variant="outline" disabled={Boolean(operationLoading) || operationRunning} onClick={() => void runOperation("RESTART_NAPCAT", "重启 NapCat 并重新登录")}><Power className="mr-2 h-4 w-4" />重启 NapCat</Button>
          <Button disabled={Boolean(operationLoading) || operationRunning} onClick={() => void runOperation("REFRESH_LOGIN", "刷新 QQ 登录凭证")}><KeyRound className="mr-2 h-4 w-4" />刷新登录凭证</Button>
          {data?.operation?.hasLoginCredentials && <Button variant="secondary" disabled={Boolean(operationLoading)} onClick={() => void revealCredentials()}>查看登录凭证</Button>}
        </div>
        {credentials && <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-[auto_1fr]">
          <div className="flex min-h-48 min-w-48 items-center justify-center rounded-lg bg-white p-3">
            {credentials.qrcode ? <QRCodeSVG value={credentials.qrcode} size={168} level="M" /> : <span className="max-w-40 text-center text-sm text-slate-500">当前没有普通登录二维码</span>}
          </div>
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">登录状态：</span>{credentials.isLogin ? "已登录" : credentials.isOffline ? "已掉线" : "等待登录"}</p>
            {credentials.captchaUrl && <a className="flex items-center gap-1 text-primary underline" href={credentials.captchaUrl} target="_blank" rel="noreferrer">打开滑块验证 <ExternalLink className="h-3.5 w-3.5" /></a>}
            {credentials.deviceVerificationUrl && <a className="flex items-center gap-1 text-primary underline" href={credentials.deviceVerificationUrl} target="_blank" rel="noreferrer">打开设备验证 <ExternalLink className="h-3.5 w-3.5" /></a>}
            {credentials.loginError && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">{credentials.loginError}</p>}
            <p className="text-xs text-muted-foreground">当前 NapCat 版本不提供短信验证码读取接口。凭证结果约 5 分钟后自动删除；每次查看均写入审计日志。</p>
          </div>
        </div>}
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
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5">方向</th><th className="px-3 py-2.5">状态</th><th className="px-3 py-2.5">安全引用</th><th className="px-3 py-2.5">尝试</th><th className="px-3 py-2.5">耗时</th><th className="px-3 py-2.5">错误/下次重试</th><th className="px-3 py-2.5">创建时间</th><th className="px-3 py-2.5">详情</th></tr></thead>
            <tbody>{data?.events.length ? data.events.map((event) => <tr key={`${event.kind}-${event.id}`} className="border-t align-top hover:bg-muted/20">
              <td className="px-3 py-3">{event.kind === "INBOX" ? "用户消息" : "机器人通知"}</td>
              <td className="px-3 py-3"><StatusBadge status={event.status} /></td>
              <td className="px-3 py-3 font-mono text-xs">{event.reference}{event.selfId ? <span className="block text-muted-foreground">bot {event.selfId}</span> : null}</td>
              <td className="px-3 py-3">{event.attempts ?? "-"}</td>
              <td className="px-3 py-3 font-mono text-xs">{formatLatency(event.latencyMs)}</td>
              <td className="max-w-[260px] px-3 py-3 text-xs"><span className={event.error ? "text-red-700" : "text-muted-foreground"}>{event.error ?? (event.nextAttemptAt ? `重试：${formatTime(event.nextAttemptAt)}` : "-")}</span></td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatTime(event.createdAt)}</td>
              <td className="px-3 py-3"><Button size="sm" variant="outline" disabled={detailLoading} onClick={() => void loadDetail(event.id, event.kind)}>查看原文</Button></td>
            </tr>) : <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">{loading ? "正在加载..." : "暂无符合条件的机器人事件"}</td></tr>}</tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={!data || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{page} / {data?.pagination.totalPages ?? 1}</span>
          <Button size="sm" variant="outline" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>
      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>QQ 消息审计详情</DialogTitle></DialogHeader>
          {detail && <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <p><span className="text-muted-foreground">事件：</span><span className="font-mono text-xs">{String(detail.eventId ?? detail.id)}</span></p>
              <p><span className="text-muted-foreground">类型：</span>{detail.kind === "OUTBOX" ? "机器人通知" : `用户消息 · bot ${String(detail.selfId)}`}</p>
              <p><span className="text-muted-foreground">接收时间：</span>{formatTime(String(detail.createdAt))}</p>
              <p><span className="text-muted-foreground">处理时间：</span>{detail.processedAt ? formatTime(String(detail.processedAt)) : "未处理"}</p>
            </div>
            {detail.kind !== "OUTBOX" && detail.sender && typeof detail.sender === "object" ? <div>
              <h3 className="mb-2 font-semibold">发送者与绑定账号</h3>
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                {([
                  ["用户名", (detail.sender as Record<string, unknown>).username ?? "未设置"],
                  ["QQ 号", (detail.sender as Record<string, unknown>).qqNumber ?? "无法解密"],
                  ["昵称", (detail.sender as Record<string, unknown>).nickname ?? "未设置"],
                  ["账号角色", (detail.sender as Record<string, unknown>).role ?? "-"],
                  ["用户 ID", (detail.sender as Record<string, unknown>).userId ?? "-"],
                  ["账号状态", !(detail.sender as Record<string, unknown>).userId ? "未绑定" : (detail.sender as Record<string, unknown>).isBanned ? "已封禁" : "正常"],
                ] as const).map(([label, value]) => <p key={label}><span className="text-muted-foreground">{label}：</span><span className={label === "QQ 号" || label === "用户 ID" ? "font-mono text-xs" : ""}>{String(value)}</span></p>)}
              </div>
            </div> : null}
            {detail.kind === "OUTBOX" ? <><div><h3 className="mb-2 font-semibold">机器人通知原文</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-slate-950 p-4 text-xs text-slate-100">{String(detail.content)}</pre></div><div><h3 className="mb-2 font-semibold">投递状态</h3><pre className="overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify({ status: detail.status, attemptCount: detail.attemptCount, nextAttemptAt: detail.nextAttemptAt, providerMessageId: detail.providerMessageId, lastError: detail.lastError, deliveredAt: detail.deliveredAt }, null, 2)}</pre></div></> : <><div><h3 className="mb-2 font-semibold">用户发送原文</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-slate-950 p-4 text-xs text-slate-100">{detail.input == null ? "历史消息未保存输入原文" : JSON.stringify(detail.input, null, 2)}</pre></div><div><h3 className="mb-2 font-semibold">机器人回复原文</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-slate-950 p-4 text-xs text-slate-100">{detail.replies == null ? "无回复记录" : JSON.stringify(detail.replies, null, 2)}</pre></div><div><h3 className="mb-2 font-semibold">会话状态</h3><pre className="overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify(detail.responseState, null, 2)}</pre></div></>}
            <p className="text-xs text-amber-700">一次性授权 token、API Key 和 Bearer 凭据已自动脱敏；本次查看已写入审计日志。</p>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
