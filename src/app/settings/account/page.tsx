"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Mail, MessageCircle, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";

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
  const [method, setMethod] = useState<"email" | "phone">("phone");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [destination, setDestination] = useState("");
  const [notice, setNotice] = useState({ title: "注销须知", content: "", revision: 0 });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [allowDirectMessages, setAllowDirectMessages] = useState(true);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");

  const load = useCallback(async () => {
    const [response, noticeResponse, privacyResponse] = await Promise.all([
      fetch("/api/account/deletion-request", { cache: "no-store" }),
      fetch("/api/site-content/account_deletion_notice", { cache: "no-store" }),
      fetch("/api/users/me/privacy", { cache: "no-store" }),
    ]);
    const [data, noticeData, privacyData] = await Promise.all([response.json().catch(() => ({})), noticeResponse.json().catch(() => ({})), privacyResponse.json().catch(() => ({}))]);
    if (response.ok) setRequest(data.request ?? null);
    if (noticeResponse.ok) setNotice({ title: noticeData.title || "注销须知", content: noticeData.content || "", revision: noticeData.revision || 1 });
    if (privacyResponse.ok) setAllowDirectMessages(privacyData.allowDirectMessages !== false);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function sendCode() {
    setSending(true); setMessage("");
    const response = await fetch("/api/account/deletion-verification", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) { setCountdown(60); setDestination(data.destination || ""); }
    else setMessage(data.error || "验证码发送失败");
    setSending(false);
  }

  async function submit() {
    if (!window.confirm("确认提交账号注销申请？管理员批准后将无法恢复登录。")) return;
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/account/deletion-request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, method, code: code.trim(), noticeAccepted, noticeRevision: notice.revision }),
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

  async function updateDirectMessages(allowed: boolean) {
    setPrivacySaving(true); setPrivacyMessage("");
    const response = await fetch("/api/users/me/privacy", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowDirectMessages: allowed }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setAllowDirectMessages(data.allowDirectMessages);
      setPrivacyMessage(data.allowDirectMessages ? "已允许接收私信" : "已关闭私信");
    } else setPrivacyMessage(data.error || "私信设置保存失败");
    setPrivacySaving(false);
  }

  return (
    <main className="mx-auto max-w-screen-md space-y-6 px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold">账号与注销</h1>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" />私信设置</CardTitle></CardHeader>
        <CardContent>
          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
            <span><span className="block text-sm font-medium">允许其他用户给我发私信</span><span className="mt-1 block text-xs text-muted-foreground">关闭后，其他用户无法新建会话或在现有会话中向你发送消息；你仍可查看并举报历史私信。</span></span>
            <input type="checkbox" role="switch" checked={allowDirectMessages} disabled={loading || privacySaving} onChange={(event) => void updateDirectMessages(event.target.checked)} className="h-5 w-5 shrink-0 accent-primary" aria-label="允许接收私信" />
          </label>
          {privacyMessage && <p className="mt-3 text-sm text-muted-foreground" role="status">{privacyMessage}</p>}
        </CardContent>
      </Card>
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
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">安全验证</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={method === "phone" ? "default" : "outline"} onClick={() => { setMethod("phone"); setDestination(""); }}><Smartphone className="h-4 w-4" />手机号</Button>
                  <Button type="button" variant={method === "email" ? "default" : "outline"} onClick={() => { setMethod("email"); setDestination(""); }}><Mail className="h-4 w-4" />邮箱</Button>
                </div>
                <div className="flex gap-2"><Input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="请输入 6 位验证码" aria-label="注销验证码" /><Button type="button" variant="outline" disabled={sending || countdown > 0} onClick={sendCode}>{countdown > 0 ? `${countdown}s` : sending ? "发送中..." : "发送验证码"}</Button></div>
                {destination && <p className="text-xs text-muted-foreground">验证码已发送至 {destination}</p>}
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} className="mt-1" /><span>我已阅读并同意<button type="button" className="mx-1 text-primary underline underline-offset-2" onClick={() => setNoticeOpen(true)}>《注销须知》</button></span></label>
              <Button variant="destructive" disabled={submitting || code.length !== 6 || !noticeAccepted || notice.revision < 1} onClick={submit}>{submitting ? "提交中..." : "提交注销申请"}</Button>
            </div>
          )}
          {message && <p role="status" className="text-sm">{message}</p>}
        </CardContent>
      </Card>
      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}><DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{notice.title}</DialogTitle></DialogHeader><SafeMarkdown content={notice.content || "暂无内容"} /></DialogContent></Dialog>
    </main>
  );
}
