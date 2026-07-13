"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "idle" | "running" | "error";

export function SystemMaintenancePanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function waitForRestart(): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const response = await fetch(`/DEPLOYMENT?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (response.ok) return;
      } catch {
        // The process is expected to be briefly unavailable while restarting.
      }
    }
  }

  async function handleRestart() {
    const confirmed = window.confirm(
      "确认清空 Redis、Next.js 和浏览器缓存并重启论坛服务？服务会短暂中断数秒。",
    );
    if (!confirmed) return;

    setStatus("running");
    setMessage("正在清理缓存并重启服务…");

    try {
      const response = await fetch("/api/admin/system/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESTART" }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");

      if ("caches" in window) {
        const names = await window.caches.keys();
        await Promise.all(names.map((name) => window.caches.delete(name)));
      }

      setMessage("缓存已清理，等待服务恢复…");
      await waitForRestart();
      window.location.replace(`/admin/system?refreshed=${Date.now()}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "操作失败，请重试");
    }
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-amber-600" />
          <CardTitle>强制刷新并重启</CardTitle>
        </div>
        <CardDescription>
          清空 Redis、Next.js 服务端缓存及当前浏览器缓存，然后重启应用容器。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>操作会清除验证码、频率限制等临时数据，并造成数秒服务中断。数据库内容不会被删除。</p>
        </div>

        {message && (
          <p className={status === "error" ? "text-sm text-red-600" : "text-sm text-muted-foreground"} role="status">
            {message}
          </p>
        )}

        <Button
          variant="destructive"
          onClick={handleRestart}
          disabled={status === "running"}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${status === "running" ? "animate-spin" : ""}`} />
          {status === "running" ? "正在刷新并重启…" : "清空缓存并重启"}
        </Button>
      </CardContent>
    </Card>
  );
}
