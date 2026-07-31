"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type IdentityStatus = { bound: boolean; maskedQQ?: string; boundAt?: string };
type QQStatus = { bound: boolean; personal: IdentityStatus; official: IdentityStatus };

export default function QQSettingsPage() {
  const [status, setStatus] = useState<QQStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<"personal" | "official" | null>(null);

  useEffect(() => {
    fetch("/api/qq/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "读取 QQ 绑定状态失败");
        setStatus(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取 QQ 绑定状态失败"));
  }, []);

  async function unbind(provider: "personal" | "official") {
    if (!window.confirm("解绑后 QQ 机器人将无法识别此账号。确认解绑吗？")) return;
    setRemoving(provider);
    setError(null);
    try {
      const response = await fetch(`/api/qq/settings?provider=${provider}`, { method: "DELETE", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "解绑失败");
      setStatus((current) => current ? {
        ...current,
        bound: provider === "personal" ? current.official.bound : current.personal.bound,
        [provider]: { bound: false },
      } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "解绑失败");
    } finally {
      setRemoving(null);
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
          {status && ([
            { provider: "personal" as const, label: "个人 QQ 机器人", value: status.personal },
            { provider: "official" as const, label: "QQ 官方机器人", value: status.official },
          ]).map(({ provider, label, value }) => (
            <div key={provider} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="mt-1 font-mono text-sm text-muted-foreground">{value.bound ? value.maskedQQ : "未绑定"}</div>
              </div>
              {value.bound && <Button variant="destructive" size="sm" disabled={removing !== null} onClick={() => void unbind(provider)}><Unlink className="h-4 w-4" />{removing === provider ? "正在解绑..." : "解绑"}</Button>}
            </div>
          ))}
          {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
