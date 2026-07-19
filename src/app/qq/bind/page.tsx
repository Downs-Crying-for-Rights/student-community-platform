"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Preview = { maskedQQ: string; expiresAt: string };

export default function QQBindPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [bound, setBound] = useState(false);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(rawToken);
    if (!rawToken) {
      setError("绑定链接缺少凭证，请返回 QQ 重新发起绑定");
      setLoading(false);
      return;
    }
    fetch("/api/qq/bind/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "读取绑定信息失败");
        setPreview(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取绑定信息失败"))
      .finally(() => setLoading(false));
  }, []);

  async function confirmBinding() {
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch("/api/qq/bind/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, confirmed: true }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "绑定失败");
      setBound(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "绑定失败");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white px-4 py-8 dark:from-slate-950 dark:to-background">
      <Card className="mx-auto max-w-md overflow-hidden border-sky-100 shadow-lg dark:border-slate-800">
        <div className="h-1.5 bg-sky-500" />
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {bound ? <CheckCircle2 /> : <Link2 />}
          </div>
          <CardTitle>{bound ? "QQ 绑定成功" : "确认绑定 QQ"}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            绑定后，QQ 机器人可以识别您的站内账号。平台不会在页面、日志或通知中展示完整 QQ 号。
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在安全校验...</div>}
          {preview && !bound && (
            <div className="rounded-2xl bg-sky-50 p-4 dark:bg-sky-950/40">
              <div className="text-xs font-medium text-sky-700 dark:text-sky-300">待绑定 QQ</div>
              <div className="mt-1 font-mono text-2xl font-semibold tracking-wider">{preview.maskedQQ}</div>
              <div className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />请确认这是您正在使用的 QQ。每个账号只能绑定一个 QQ。</div>
            </div>
          )}
          {bound && <div className="rounded-2xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">绑定已完成。出于安全原因，现有登录会话可能需要重新登录。</div>}
          {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
          {preview && !bound && <Button className="h-11 w-full rounded-xl" disabled={confirming} onClick={confirmBinding}>{confirming && <Loader2 className="h-4 w-4 animate-spin" />}{confirming ? "正在绑定..." : "确认绑定此 QQ"}</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
