"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Preview = {
  caseId: string;
  category: string;
  requestStatus: string;
  reviewUrl: string;
};

export default function QQReviewPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(rawToken);
    if (!rawToken) {
      setError("审核链接缺少凭证，请返回 QQ 重新打开");
      setLoading(false);
      return;
    }
    fetch("/api/qq/review/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "校验审核链接失败");
        setPreview(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "校验审核链接失败"))
      .finally(() => setLoading(false));
  }, []);

  async function openReviewQueue() {
    if (!preview) return;
    setOpening(true);
    setError(null);
    try {
      const response = await fetch("/api/qq/review/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, consume: true }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "打开审核队列失败");
      router.replace(data.reviewUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "打开审核队列失败");
      setOpening(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-md space-y-4">
        <header className="rounded-3xl bg-gradient-to-br from-indigo-500 to-sky-700 p-6 shadow-xl">
          <ClipboardCheck className="mb-5 h-10 w-10" />
          <h1 className="text-2xl font-bold">委托审核入口</h1>
          <p className="mt-2 text-sm leading-6 text-sky-100">此页面只校验审核权限。实际审核仍在管理员工作台完成。</p>
        </header>
        {loading && <div className="flex justify-center gap-2 rounded-2xl bg-slate-900 py-14 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin" />正在安全校验...</div>}
        {preview && (
          <Card className="border-slate-700 bg-slate-900 text-slate-100">
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-400" />权限校验通过</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-800 p-3"><div className="text-xs text-slate-400">委托编号</div><div className="mt-1 break-all font-mono">{preview.caseId}</div></div>
                <div className="rounded-xl bg-slate-800 p-3"><div className="text-xs text-slate-400">当前状态</div><div className="mt-1 font-medium">{preview.requestStatus}</div></div>
              </div>
              <Button className="h-12 w-full rounded-xl" disabled={opening} onClick={openReviewQueue}>{opening && <Loader2 className="h-4 w-4 animate-spin" />}{opening ? "正在进入..." : "进入管理员审核工作台"}</Button>
              <p className="text-xs leading-5 text-slate-400">只有点击进入时才会使用一次性链接；留在此页不会修改委托。</p>
            </CardContent>
          </Card>
        )}
        {error && <div role="alert" className="rounded-2xl bg-red-950/60 px-4 py-3 text-sm leading-6 text-red-200">{error}</div>}
      </div>
    </main>
  );
}
