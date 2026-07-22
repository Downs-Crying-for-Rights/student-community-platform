"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support-ticket";

interface Message { id: string; content: string; authorType: "USER" | "STAFF" | "SYSTEM"; createdAt: string; author: { nickname: string | null } | null }
interface Ticket { id: string; kind: "GENERAL" | "PUNISHMENT_APPEAL"; subject: string; status: SupportStatus; createdAt: string; assignedTo: { nickname: string | null } | null; messages: Message[] }

export default function SupportTicketPage() {
  const id = useParams<{ id: string }>().id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/support/${id}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "加载工单失败");
      setTicket(data.ticket);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载工单失败");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function reply(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/support/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "回复失败");
      setContent(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "回复失败"); }
    finally { setSubmitting(false); }
  }

  async function closeTicket() {
    if (!window.confirm("确认关闭此工单？关闭后不能继续回复。")) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/support/${id}/close`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "关闭失败");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "关闭失败"); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!ticket) return <div className="mx-auto max-w-3xl px-4 py-8"><p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">{error || "工单不存在"}</p></div>;
  return <div className="mx-auto max-w-3xl px-4 py-8">
    <div className="mb-4 flex items-center justify-between"><Button variant="ghost" asChild><Link href="/support"><ArrowLeft className="h-4 w-4" />返回列表</Link></Button>{ticket.kind === "GENERAL" && ticket.status !== "CLOSED" && <Button variant="outline" onClick={closeTicket} disabled={submitting}>关闭工单</Button>}</div>
    <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{ticket.subject}</CardTitle><p className="mt-1 text-xs text-muted-foreground">创建于 {new Date(ticket.createdAt).toLocaleString("zh-CN")}</p></div><span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs">{SUPPORT_STATUS_LABELS[ticket.status]}</span></div></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">{ticket.messages.map((message) => <article key={message.id} className={`rounded-lg border p-4 ${message.authorType === "STAFF" ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20" : "bg-muted/20"}`}><div className="mb-2 flex justify-between gap-4 text-xs text-muted-foreground"><span>{message.authorType === "STAFF" ? message.author?.nickname || "客服人员" : message.authorType === "USER" ? "我" : "系统"}</span><time>{new Date(message.createdAt).toLocaleString("zh-CN")}</time></div><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p></article>)}</div>
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {ticket.status !== "CLOSED" && !(ticket.kind === "PUNISHMENT_APPEAL" && ticket.status === "RESOLVED") && <form onSubmit={reply} className="space-y-3"><label htmlFor="reply" className="text-sm font-medium">继续回复</label><textarea id="reply" value={content} onChange={(event) => setContent(event.target.value)} required maxLength={5000} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button type="submit" disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}发送回复</Button></form>}
      </CardContent></Card>
  </div>;
}
