"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Gauge, Monitor, RefreshCw, Search, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface TelemetryEvent {
  id: string;
  scope: "CLIENT" | "SERVER";
  type: string;
  name: string;
  route: string;
  duration: number | null;
  value: number | null;
  status: number | null;
  sessionId: string | null;
  userId: string | null;
  release: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface TelemetryData {
  hours: number;
  summary: { total: number; client: number; server: number; errors: number; errorRate: number };
  topRoutes: Array<{ route: string; count: number; avgDuration: number | null }>;
  webVitals: Array<{ name: string; count: number; average: number | null }>;
  events: TelemetryEvent[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function EventDetails({ event }: { event: TelemetryEvent }) {
  const metadata = event.metadata || {};
  const stack = typeof metadata.stack === "string" ? metadata.stack : null;
  const message = typeof metadata.errorMessage === "string"
    ? metadata.errorMessage
    : typeof metadata.message === "string" ? metadata.message : null;
  const validationDetails = typeof metadata.validationDetails === "string"
    ? metadata.validationDetails
    : null;
  return (
    <div className="space-y-3 border-t bg-muted/30 p-4 text-xs">
      {message && <div><p className="mb-1 font-semibold text-destructive">错误信息</p><pre className="overflow-auto whitespace-pre-wrap rounded border bg-background p-3 font-mono">{message}</pre></div>}
      {validationDetails && <div><p className="mb-1 font-semibold text-amber-700">字段校验详情</p><pre className="overflow-auto whitespace-pre-wrap rounded border border-amber-200 bg-amber-50 p-3 font-mono text-amber-900">{validationDetails}</pre></div>}
      {stack && <div><p className="mb-1 font-semibold">调用堆栈</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border bg-slate-950 p-3 font-mono text-slate-200">{stack}</pre></div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="text-muted-foreground">事件 ID：</span><span className="font-mono">{event.id}</span></p>
        <p><span className="text-muted-foreground">用户 ID：</span><span className="font-mono">{event.userId || "匿名"}</span></p>
        <p><span className="text-muted-foreground">会话 ID：</span><span className="font-mono">{event.sessionId || "-"}</span></p>
        <p><span className="text-muted-foreground">发布版本：</span><span className="font-mono">{event.release || "-"}</span></p>
        <p><span className="text-muted-foreground">状态码：</span>{event.status ?? "-"}</p>
        <p><span className="text-muted-foreground">耗时：</span>{event.duration == null ? "-" : `${event.duration.toFixed(1)} ms`}</p>
        <p><span className="text-muted-foreground">指标值：</span>{event.value ?? "-"}</p>
        <p><span className="text-muted-foreground">发生时间：</span>{new Date(event.createdAt).toLocaleString("zh-CN")}</p>
      </div>
      {event.userAgent && <div><p className="mb-1 font-semibold">User-Agent</p><p className="break-all rounded border bg-background p-2 font-mono">{event.userAgent}</p></div>}
      <div><p className="mb-1 font-semibold">完整上下文</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-background p-3 font-mono">{JSON.stringify(metadata, null, 2)}</pre></div>
    </div>
  );
}

export default function TelemetryPage() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("24");
  const [scope, setScope] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ hours, page: String(page), pageSize: "50" });
      if (scope) params.set("scope", scope);
      if (type) params.set("type", type);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/telemetry?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "获取遥测失败");
      setData(body); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取遥测失败");
    } finally {
      setLoading(false);
    }
  }, [hours, page, scope, search, type]);

  useEffect(() => { void load(); }, [load]);
  const resetPage = () => { setPage(1); setExpandedId(null); };
  const cards = [
    ["事件总数", data?.summary.total ?? 0, Activity],
    ["前端事件", data?.summary.client ?? 0, Monitor],
    ["后端事件", data?.summary.server ?? 0, Server],
    ["错误", data?.summary.errors ?? 0, AlertTriangle],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">应用遥测</h1><p className="mt-1 text-sm text-muted-foreground">完整查看前端错误、服务端异常、请求性能和 Web Vitals；敏感凭据自动脱敏。</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}</div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-4"><h2 className="mb-3 flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4" />Web Vitals 平均值</h2><div className="space-y-2">{data?.webVitals.length ? data.webVitals.map((item) => <div key={item.name} className="flex justify-between rounded bg-muted/50 px-3 py-2 text-sm"><span>{item.name} · {item.count} 次</span><span className="font-mono">{item.average == null ? "-" : item.name === "CLS" ? item.average.toFixed(3) : `${Math.round(item.average)} ms`}</span></div>) : <p className="text-sm text-muted-foreground">暂无指标</p>}</div></CardContent></Card>
        <Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">热门路由</h2><div className="space-y-2">{data?.topRoutes.map((item) => <div key={item.route} className="flex justify-between gap-3 rounded bg-muted/50 px-3 py-2 text-sm"><span className="truncate font-mono">{item.route}</span><span className="shrink-0">{item.count} 次{item.avgDuration == null ? "" : ` · ${Math.round(item.avgDuration)} ms`}</span></div>)}</div></CardContent></Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <select value={hours} onChange={(e) => { setHours(e.target.value); resetPage(); }} className={selectClass} aria-label="时间范围"><option value="1">最近 1 小时</option><option value="24">最近 24 小时</option><option value="168">最近 7 天</option><option value="720">最近 30 天</option></select>
          <select value={scope} onChange={(e) => { setScope(e.target.value); resetPage(); }} className={selectClass} aria-label="来源"><option value="">全部来源</option><option value="CLIENT">前端</option><option value="SERVER">后端</option></select>
          <select value={type} onChange={(e) => { setType(e.target.value); resetPage(); }} className={selectClass} aria-label="事件类型"><option value="">全部类型</option><option value="error">错误</option><option value="request">后端请求</option><option value="page_view">页面访问</option><option value="web_vital">Web Vital</option><option value="event">自定义事件</option></select>
          <div className="relative min-w-[220px] flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="搜索事件名、路由或发布版本" className="pl-8" /></div>
        </div>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">事件明细</h2><span className="text-xs text-muted-foreground">筛选结果 {data?.pagination.total ?? 0} 条</span></div>
        <div className="overflow-hidden rounded-lg border">
          {data?.events.length ? data.events.map((event) => {
            const expanded = expandedId === event.id;
            const hasError = event.type === "error" || (event.status ?? 0) >= 400;
            return <div key={event.id} className="border-b last:border-0">
              <button type="button" onClick={() => setExpandedId(expanded ? null : event.id)} className="grid w-full grid-cols-[80px_90px_minmax(140px,1fr)_minmax(140px,2fr)_90px_24px] items-center gap-2 px-3 py-3 text-left text-xs hover:bg-muted/50">
                <span className={event.scope === "CLIENT" ? "text-blue-600" : "text-violet-600"}>{event.scope === "CLIENT" ? "前端" : "后端"}</span>
                <span className={hasError ? "font-semibold text-destructive" : "text-muted-foreground"}>{event.type}{event.status ? ` · ${event.status}` : ""}</span>
                <span className="truncate font-medium">{event.name}</span><span className="truncate font-mono text-muted-foreground">{event.route}</span>
                <span className="whitespace-nowrap text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</span>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expanded && <EventDetails event={event} />}
            </div>;
          }) : <p className="p-10 text-center text-sm text-muted-foreground">暂无符合条件的事件</p>}
        </div>
        <div className="mt-4 flex items-center justify-center gap-3"><Button size="sm" variant="outline" disabled={!data || page <= 1} onClick={() => setPage((v) => v - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">{page} / {data?.pagination.totalPages ?? 1}</span><Button size="sm" variant="outline" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage((v) => v + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </CardContent></Card>
    </div>
  );
}
