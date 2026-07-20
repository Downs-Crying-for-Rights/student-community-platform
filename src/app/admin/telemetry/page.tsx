"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface RequestEvent {
  id: string;
  name: string;
  route: string;
  duration: number | null;
  status: number | null;
  release: string | null;
  metadata: { method?: string; requestId?: string; outcome?: string; errorDetail?: string; errorValidation?: string; errorCode?: string } | null;
  createdAt: string;
}

interface EndpointMetric {
  method: string;
  route: string;
  count: number;
  errors: number;
  avgDuration: number;
  maxDuration: number;
  errorRate: number;
}

interface TelemetryData {
  summary: { requests: number; errors: number; errorRate: number; p50: number | null; p95: number | null; p99: number | null };
  statusGroups: Record<"2xx" | "3xx" | "4xx" | "5xx", number>;
  endpointBreakdown: EndpointMetric[];
  slowEndpoints: EndpointMetric[];
  errorEndpoints: EndpointMetric[];
  filterOptions: { releases: Array<string | null>; routes: string[] };
  events: RequestEvent[];
  pagination: { page: number; total: number; totalPages: number };
}

const selectClass = "h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm";
const ms = (value: number | null) => value == null ? "-" : `${Math.round(value)} ms`;

function EndpointTable({ title, rows }: { title: string; rows: EndpointMetric[] }) {
  return <Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">{title}</h2><div className="space-y-2">{rows.length ? rows.map((item) => (
    <div key={`${item.method}:${item.route}`} className="grid grid-cols-[55px_minmax(0,1fr)_auto] gap-2 rounded bg-muted/50 px-3 py-2 text-xs">
      <span className="font-semibold">{item.method}</span><span className="truncate font-mono">{item.route}</span>
      <span className="text-right">{item.count} 次 · {ms(item.avgDuration)}{item.errors ? ` · ${(item.errorRate * 100).toFixed(1)}% 错误` : ""}</span>
    </div>
  )) : <p className="text-sm text-muted-foreground">暂无请求</p>}</div></CardContent></Card>;
}

export default function TelemetryPage() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("24");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [release, setRelease] = useState("");
  const [route, setRoute] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ hours, page: String(page), pageSize: "50" });
      if (method) params.set("method", method);
      if (status) params.set("status", status);
      if (release) params.set("release", release);
      if (route) params.set("route", route);
      const response = await fetch(`/api/admin/telemetry?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "获取遥测失败");
      setData(body); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "获取遥测失败");
    } finally {
      setLoading(false);
    }
  }, [hours, method, page, release, route, status]);

  useEffect(() => { void load(); }, [load]);
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const cards = [
    ["请求总数", data?.summary.requests ?? 0, Server],
    ["错误请求", data?.summary.errors ?? 0, AlertTriangle],
    ["P50", ms(data?.summary.p50 ?? null), Clock],
    ["P95 / P99", `${ms(data?.summary.p95 ?? null)} / ${ms(data?.summary.p99 ?? null)}`, Clock],
  ] as const;

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">后端请求遥测</h1><p className="mt-1 text-sm text-muted-foreground">100% 完成请求的状态、延迟、版本和规范化端点；错误详情经脱敏后采集，不采集请求体、查询参数、Cookie 或密钥。</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button></div>
    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <Card><CardContent className="flex flex-wrap gap-2 p-4">
      <select value={hours} onChange={(e) => changeFilter(setHours, e.target.value)} className={selectClass} aria-label="时间范围"><option value="1">最近 1 小时</option><option value="24">最近 24 小时</option><option value="168">最近 7 天</option><option value="720">最近 30 天</option></select>
      <select value={method} onChange={(e) => changeFilter(setMethod, e.target.value)} className={selectClass} aria-label="请求方法"><option value="">全部方法</option>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => <option key={item}>{item}</option>)}</select>
      <select value={status} onChange={(e) => changeFilter(setStatus, e.target.value)} className={selectClass} aria-label="状态码"><option value="">全部状态</option>{["2xx", "3xx", "4xx", "5xx"].map((item) => <option key={item}>{item}</option>)}</select>
      <select value={release} onChange={(e) => changeFilter(setRelease, e.target.value)} className={selectClass} aria-label="发布版本"><option value="">全部版本</option>{data?.filterOptions.releases.filter(Boolean).map((item) => <option key={item!}>{item}</option>)}</select>
      <select value={route} onChange={(e) => changeFilter(setRoute, e.target.value)} className={`${selectClass} min-w-[240px]`} aria-label="路由"><option value="">全部路由</option>{data?.filterOptions.routes.map((item) => <option key={item}>{item}</option>)}</select>
    </CardContent></Card>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>)}</div>
    <Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">状态分布</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(data?.statusGroups ?? {}).map(([key, value]) => <div key={key} className="rounded bg-muted/50 p-3 text-center"><p className="text-xs text-muted-foreground">{key}</p><p className="text-xl font-bold">{value}</p></div>)}</div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2"><EndpointTable title="慢端点" rows={data?.slowEndpoints ?? []} /><EndpointTable title="错误端点" rows={data?.errorEndpoints ?? []} /></div>
    <EndpointTable title="端点请求量" rows={data?.endpointBreakdown ?? []} />
    <Card><CardContent className="p-4"><div className="mb-3 flex justify-between"><h2 className="font-semibold">请求明细</h2><span className="text-xs text-muted-foreground">{data?.pagination.total ?? 0} 条</span></div><div className="overflow-x-auto rounded border"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-muted"><tr><th className="p-3">时间</th><th>方法</th><th>路由</th><th>状态</th><th>耗时</th><th>错误详情</th><th>版本</th><th>请求 ID</th></tr></thead><tbody>{data?.events.map((event) => { const detail = [event.metadata?.errorCode, event.metadata?.errorDetail, event.metadata?.errorValidation].filter(Boolean).join("\n"); return <tr key={event.id} className="border-t align-top"><td className="p-3 whitespace-nowrap">{new Date(event.createdAt).toLocaleString("zh-CN")}</td><td>{event.metadata?.method ?? event.name.split(" ")[0]}</td><td className="font-mono">{event.route}</td><td className={(event.status ?? 0) >= 400 ? "font-semibold text-destructive" : ""}>{event.status}</td><td>{ms(event.duration)}</td><td className="max-w-[360px] py-2 pr-3">{detail ? <details><summary className="cursor-pointer font-medium text-destructive">查看详情</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px]">{detail}</pre></details> : "-"}</td><td>{event.release ?? "-"}</td><td className="font-mono">{event.metadata?.requestId ?? "-"}</td></tr>; })}</tbody></table></div><div className="mt-4 flex items-center justify-center gap-3"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">{page} / {data?.pagination.totalPages ?? 1}</span><Button size="sm" variant="outline" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></CardContent></Card>
  </div>;
}
