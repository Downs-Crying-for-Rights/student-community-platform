"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AppealContext = {
  punishment: { typeLabel: string; reason: string; startsAt: string; expiresAt: string | null };
  existingAppeal: { id: string; status: string } | null;
};

export default function BanAppealPage() {
  const [context, setContext] = useState<AppealContext | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/punishments/ban-appeal", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "无法读取封禁信息");
        setContext(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法读取封禁信息"))
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true); setError("");
    const response = await fetch("/api/punishments/ban-appeal", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) { setSubmitted(true); setContent(""); }
    else setError(data.error || "申诉提交失败");
    setSubmitting(false);
  }

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
    <Card className="w-full max-w-2xl border-destructive/30 shadow-lg">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" />封禁原因与申诉</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在核验申诉凭证...</div> : context ? <>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{context.punishment.typeLabel}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{context.punishment.reason}</p>
            <p className="mt-3 text-xs text-muted-foreground">生效时间：{new Date(context.punishment.startsAt).toLocaleString("zh-CN")}<br />{context.punishment.expiresAt ? `到期时间：${new Date(context.punishment.expiresAt).toLocaleString("zh-CN")}` : "封禁期限：永久"}</p>
          </div>
          {context.existingAppeal || submitted ? <div className="rounded-lg bg-muted p-4 text-sm">申诉已提交，工作人员会通过工单进行复核。</div> : <div className="space-y-3">
            <label className="block space-y-2"><span className="text-sm font-medium">申诉说明</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} rows={7} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="说明你认为处罚需要复核的原因和相关情况" /></label>
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>请勿提交密码或验证码</span><span>{content.length}/5000</span></div>
            <Button onClick={submit} disabled={submitting || !content.trim()}>{submitting ? "提交中..." : "提交申诉"}</Button>
          </div>}
        </> : <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error || "申诉凭证已失效，请重新验证账号密码。"}</span></div>
          <Button asChild><Link href="/login">返回登录并重新验证</Link></Button>
        </div>}
        {context && error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  </main>;
}
