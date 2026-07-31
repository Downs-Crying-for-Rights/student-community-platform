"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, RefreshCw, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Status {
  enabled: boolean;
  configured: boolean;
  appId: string | null;
  connectionMode: "websocket";
  gatewayEndpoint: string;
  lastEvent: { eventType: string; receivedAt: string } | null;
}

export function QQOfficialBotPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/qq-bot/official", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "读取配置失败");
    setStatus(body);
  }

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "读取配置失败"));
  }, []);

  async function testConnection() {
    setTesting(true);
    setTested(false);
    setError("");
    try {
      const response = await fetch("/api/admin/qq-bot/official", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TEST_CONNECTION", confirmation: "CONFIRM" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "连接测试失败");
      setTested(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接测试失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="mx-auto max-w-screen-xl space-y-5 px-4 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6" />QQ 官方机器人</h1>
        <p className="mt-1 text-sm text-muted-foreground">腾讯 QQ 开放平台 Gateway WebSocket 接入，与个人 QQ / NapCat 机器人相互独立。</p>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>运行状态</CardDescription><CardTitle className="text-xl">{status?.enabled ? "已启用" : "未启用"}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>服务器凭据</CardDescription><CardTitle className="text-xl">{status?.configured ? "已配置" : "未配置"}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>AppID</CardDescription><CardTitle className="font-mono text-xl">{status?.appId ?? "-"}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Radio className="h-5 w-5" />Gateway WebSocket</CardTitle>
          <CardDescription>服务器主动连接 QQ 官方 Gateway，并自动完成鉴权、心跳、断线重连和会话恢复，无需配置公网回调地址。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <code className="min-w-0 flex-1 break-all text-sm">{status?.gatewayEndpoint || "正在读取..."}</code>
          </div>
          <p className="text-sm text-muted-foreground">最近事件：{status?.lastEvent ? `${status.lastEvent.eventType} · ${new Date(status.lastEvent.receivedAt).toLocaleString("zh-CN", { hour12: false })}` : "尚未收到"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">腾讯鉴权测试</CardTitle><CardDescription>只验证服务器中的 AppID 和 ClientSecret，不会向任何 QQ 用户发送消息，也不会显示 Secret。</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={testing || !status?.configured} onClick={() => void testConnection()}><RefreshCw className={testing ? "animate-spin" : ""} />{testing ? "正在测试" : "测试连接"}</Button>
          {tested && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />腾讯鉴权成功</span>}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">ClientSecret 仅通过服务器环境变量注入，不写入数据库、不返回浏览器，也不出现在审计日志中。</p>
    </main>
  );
}
