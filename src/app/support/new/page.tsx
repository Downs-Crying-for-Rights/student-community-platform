"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUPPORT_TICKET_ATTESTATION } from "@/lib/support-ticket-policy";

export default function NewSupportTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [informationAttested, setInformationAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!informationAttested) {
      setError("请先勾选并确认工单信息声明");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content, informationAttested }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "提交失败");
      router.push(`/support/${data.ticket.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="mx-auto max-w-2xl px-4 py-8">
    <Button variant="ghost" asChild className="mb-4"><Link href="/support"><ArrowLeft className="h-4 w-4" />返回客服支持</Link></Button>
    <Card><CardHeader><CardTitle>新建客服工单</CardTitle></CardHeader><CardContent>
      <p className="mb-5 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">客服工单为私密沟通。如处理账户问题确有必要，可以填写相关账户信息，但请勿提交密码、验证码或支付凭证。</p>
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="subject">主题</Label><Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} required placeholder="简要概括需要帮助的问题" /></div>
        <div className="space-y-2"><Label htmlFor="content">问题描述</Label><textarea id="content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} required rows={10} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="请说明遇到的问题、发生时间和已尝试的解决方式" /></div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={informationAttested}
            onChange={(event) => setInformationAttested(event.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            aria-label={SUPPORT_TICKET_ATTESTATION}
          />
          <span>{SUPPORT_TICKET_ATTESTATION}</span>
        </label>
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || !informationAttested}>{submitting && <Loader2 className="h-4 w-4 animate-spin" />}提交工单</Button>
      </form>
    </CardContent></Card>
  </div>;
}
