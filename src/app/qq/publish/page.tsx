"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Preview = {
  caseId: string;
  category: string;
  publicCopy: { title: string; summary: string; expectedHelpType: string };
  activeTask: { id: string; status: string } | null;
};

export default function QQPublishPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [taskUrl, setTaskUrl] = useState<string | null>(null);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(rawToken);
    if (!rawToken) {
      setError("发布链接缺少凭证，请返回 QQ 重新打开");
      setLoading(false);
      return;
    }
    fetch("/api/qq/publish/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "校验发布链接失败");
        setPreview(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "校验发布链接失败"))
      .finally(() => setLoading(false));
  }, []);

  async function confirmPublish() {
    if (!preview) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/qq/publish/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, confirmed: true }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "发布失败");
      setTaskUrl(data.taskUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 dark:bg-slate-950">
      <div className="mx-auto max-w-md space-y-4">
        <header className="rounded-3xl bg-emerald-950 p-6 text-white shadow-xl">
          <Send className="mb-5 h-10 w-10 text-emerald-300" />
          <h1 className="text-2xl font-bold">发布互助任务</h1>
          <p className="mt-2 text-sm leading-6 text-emerald-100">审核通过后，可明确确认发布一份不含委托原文和个人信息的公开任务。</p>
        </header>
        {loading && <div className="flex justify-center gap-2 rounded-2xl bg-background py-14 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />正在安全校验...</div>}
        {preview && !taskUrl && (
          <Card>
            <CardHeader><CardTitle className="text-lg">公开内容预览</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border p-4"><h2 className="font-semibold">{preview.publicCopy.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{preview.publicCopy.summary}</p><div className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{preview.publicCopy.expectedHelpType}</div></div>
              <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />发布内容由分类生成，不会复制学校、地点、描述、审核备注或其他委托字段。</div>
              {preview.activeTask && <p className="text-sm text-muted-foreground">该委托已有进行中的任务，确认后将直接复用，不会重复创建。</p>}
              <Button className="h-12 w-full rounded-xl" disabled={publishing} onClick={confirmPublish}>{publishing && <Loader2 className="h-4 w-4 animate-spin" />}{publishing ? "正在发布..." : preview.activeTask ? "确认并打开已有任务" : "明确确认发布"}</Button>
            </CardContent>
          </Card>
        )}
        {taskUrl && <Card className="border-emerald-300"><CardContent className="p-6 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-4 text-xl font-bold">任务已就绪</h2><p className="mt-2 text-sm text-muted-foreground">一次性发布链接已安全使用。</p><Button asChild className="mt-5 w-full"><Link href={taskUrl}>查看任务</Link></Button></CardContent></Card>}
        {error && <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      </div>
    </main>
  );
}
