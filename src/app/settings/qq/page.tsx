"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type QQStatus = { bound: boolean; maskedQQ?: string; boundAt?: string };

export default function QQSettingsPage() {
  const [status, setStatus] = useState<QQStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetch("/api/qq/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "读取 QQ 绑定状态失败");
        setStatus(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取 QQ 绑定状态失败"));
  }, []);

  async function unbind() {
    if (!window.confirm("解绑后 QQ 机器人将无法识别此账号。确认解绑吗？")) return;
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/qq/settings", { method: "DELETE", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "解绑失败");
      setStatus({ bound: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "解绑失败");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">QQ 账号</h1>
      <p className="mt-2 text-sm text-muted-foreground">管理 QQ 机器人与站内账号的安全绑定。</p>
      <Card className="mt-6">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" />绑定状态</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!status && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取...</div>}
          {status?.bound ? <><div className="rounded-xl bg-muted p-4"><div className="text-xs text-muted-foreground">已绑定 QQ</div><div className="mt-1 font-mono text-xl font-semibold tracking-wider">{status.maskedQQ}</div></div><Button variant="destructive" disabled={removing} onClick={unbind}><Unlink className="h-4 w-4" />{removing ? "正在解绑..." : "解绑 QQ"}</Button></> : status && <div className="text-sm leading-6 text-muted-foreground">尚未绑定。请在 QQ 机器人中发起绑定，并打开机器人提供的一次性确认链接。</div>}
          {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
