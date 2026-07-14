"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Gauge, Monitor, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TelemetryData {
  summary: { total: number; client: number; server: number; errors: number; errorRate: number };
  topRoutes: Array<{ route: string; count: number; avgDuration: number | null }>;
  webVitals: Array<{ name: string; count: number; average: number | null }>;
  recent: Array<{ id: string; scope: "CLIENT" | "SERVER"; type: string; name: string; route: string; value: number | null; status: number | null; createdAt: string }>;
}

export default function TelemetryPage() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/telemetry", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "获取遥测失败");
      setData(body); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "获取遥测失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);

  const cards = [
    ["事件总数", data?.summary.total ?? 0, Activity], ["前端事件", data?.summary.client ?? 0, Monitor],
    ["后端事件", data?.summary.server ?? 0, Server], ["错误", data?.summary.errors ?? 0, AlertTriangle],
  ] as const;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">应用遥测</h1><p className="mt-1 text-sm text-muted-foreground">最近 24 小时的前端体验与后端请求数据，不采集业务正文。</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button></div>
    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="p-4"><h2 className="mb-3 flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4" />Web Vitals 平均值</h2><div className="space-y-2">{data?.webVitals.length ? data.webVitals.map((item) => <div key={item.name} className="flex justify-between rounded bg-muted/50 px-3 py-2 text-sm"><span>{item.name} · {item.count} 次</span><span className="font-mono">{item.average == null ? "-" : item.name === "CLS" ? item.average.toFixed(3) : `${Math.round(item.average)} ms`}</span></div>) : <p className="text-sm text-muted-foreground">等待前端数据上报</p>}</div></CardContent></Card>
      <Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">热门路由</h2><div className="space-y-2">{data?.topRoutes.map((item) => <div key={item.route} className="flex justify-between gap-3 rounded bg-muted/50 px-3 py-2 text-sm"><span className="truncate font-mono">{item.route}</span><span className="shrink-0">{item.count} 次{item.avgDuration == null ? "" : ` · ${Math.round(item.avgDuration)} ms`}</span></div>)}</div></CardContent></Card>
    </div>
    <Card><CardContent className="p-4"><h2 className="mb-3 font-semibold">最近事件</h2><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-2">时间</th><th>端</th><th>事件</th><th>路由</th><th>值/状态</th></tr></thead><tbody>{data?.recent.map((item) => <tr key={item.id} className="border-t"><td className="whitespace-nowrap py-2 pr-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td className="pr-3">{item.scope === "CLIENT" ? "前端" : "后端"}</td><td className="pr-3">{item.name}</td><td className="max-w-[260px] truncate pr-3 font-mono">{item.route}</td><td>{item.status ?? (item.value == null ? "-" : Math.round(item.value))}</td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}
