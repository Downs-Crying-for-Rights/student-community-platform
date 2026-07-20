"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DeletionRequest = {
  id: string;
  status: "PENDING" | "REJECTED" | "CANCELLED";
  reason: string | null;
  reviewNote: string | null;
  requestedAt: string;
};

export default function AccountSettingsPage() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/account/deletion-request", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRequest(data.request ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!window.confirm("确认提交账号注销申请？管理员批准后将无法恢复登录。")) return;
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/account/deletion-request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "注销申请已提交，等待管理员审核" : data.error || "提交失败");
    if (response.ok) await load();
    setSubmitting(false);
  }

  async function cancel() {
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/account/deletion-request", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "注销申请已撤回" : data.error || "撤回失败");
    if (response.ok) await load();
    setSubmitting(false);
  }

  return (
    <main className="mx-auto max-w-screen-md space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold">账号与注销</h1>
      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />申请注销账号</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            注销经管理员审核后生效。邮箱、手机号、QQ、密码、头像和个人资料将被清除；公开帖子、评论和必要的安全审计记录会保留，并显示为“已注销用户”。
          </div>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : request?.status === "PENDING" ? (
            <div className="space-y-3">
              <p className="text-sm">申请状态：等待管理员审核</p>
              <Button variant="outline" disabled={submitting} onClick={cancel}>撤回注销申请</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {request?.status === "REJECTED" && <p className="text-sm text-destructive">上次申请未通过：{request.reviewNote || "未填写原因"}</p>}
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" placeholder="注销原因（选填，最多 500 字）" />
              <Button variant="destructive" disabled={submitting} onClick={submit}>{submitting ? "提交中..." : "提交注销申请"}</Button>
            </div>
          )}
          {message && <p role="status" className="text-sm">{message}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
