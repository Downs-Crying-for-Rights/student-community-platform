"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support-ticket";

interface Person { id: string; nickname: string | null }
interface TicketListItem { id: string; kind: "GENERAL" | "PUNISHMENT_APPEAL"; subject: string; status: SupportStatus; priority: number; updatedAt: string; requester: Person; assignedTo: Person | null; punishment: { id: string; type: string; reason: string; expiresAt: string | null; revokedAt: string | null } | null; _count: { messages: number } }
interface Message { id: string; content: string; authorType: string; createdAt: string; author: Person | null }
interface TicketDetail extends Omit<TicketListItem, "_count"> { createdAt: string; messages: Message[] }

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [assignees, setAssignees] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/support?status=${filter}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "加载工单失败");
      setTickets(data.tickets ?? []); setAssignees(data.assignees ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "加载工单失败"); }
    finally { setLoading(false); }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/support/${id}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "加载工单详情失败");
    setDetail(data.ticket);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) loadDetail(selectedId).catch((reason) => setError(reason.message)); else setDetail(null); }, [selectedId, loadDetail]);

  async function update(body: { status?: SupportStatus; assignedToId?: string | null }) {
    if (!selectedId) return; setWorking(true); setError("");
    try {
      const response = await fetch(`/api/admin/support/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "更新失败");
      await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "更新失败"); }
    finally { setWorking(false); }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return; setWorking(true); setError("");
    try {
      const response = await fetch(`/api/admin/support/${selectedId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: reply }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "回复失败");
      setReply(""); await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "回复失败"); }
    finally { setWorking(false); }
  }

  async function decideAppeal(appealDecision: "ACCEPT" | "REJECT") {
    if (!selectedId) return;
    const reviewNote = window.prompt(appealDecision === "ACCEPT" ? "请输入接受申诉并解除处罚的说明：" : "请输入驳回申诉的复核说明：");
    if (!reviewNote?.trim()) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/admin/support/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appealDecision, reviewNote: reviewNote.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "处理申诉失败");
      await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "处理申诉失败"); }
    finally { setWorking(false); }
  }

  return <div className="mx-auto max-w-screen-xl p-4 md:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">客服工单</h1><p className="text-sm text-muted-foreground">统一处理一般客服问题与处罚申诉。</p></div><label className="text-sm">状态筛选<select value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 rounded-md border bg-background px-3 py-2"><option value="ALL">全部</option>{SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>)}</select></label></div>
    {error && <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="space-y-2">{loading ? <Loader2 className="mx-auto mt-12 h-6 w-6 animate-spin" /> : tickets.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">暂无工单</CardContent></Card> : tickets.map((ticket) => <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selectedId === ticket.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40"}`}><div className="flex justify-between gap-3"><strong className="truncate text-sm">{ticket.kind === "PUNISHMENT_APPEAL" ? "[处罚申诉] " : ""}{ticket.subject}</strong><span className="shrink-0 text-xs">{SUPPORT_STATUS_LABELS[ticket.status]}</span></div><p className="mt-2 text-xs text-muted-foreground">{ticket.requester.nickname || ticket.requester.id} · {ticket._count.messages} 条消息</p><p className="mt-1 text-xs text-muted-foreground">{new Date(ticket.updatedAt).toLocaleString("zh-CN")}</p></button>)}</div>
      <div>{!selectedId ? <Card><CardContent className="py-20 text-center text-muted-foreground">选择一张工单查看会话</CardContent></Card> : !detail ? <Loader2 className="mx-auto mt-20 h-6 w-6 animate-spin" /> : <Card><CardHeader><CardTitle>{detail.subject}</CardTitle><p className="text-sm text-muted-foreground">提交者：{detail.requester.nickname || detail.requester.id}</p></CardHeader><CardContent className="space-y-5">
        {detail.punishment && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><strong>关联处罚：{detail.punishment.type}</strong><p className="mt-1 whitespace-pre-wrap">{detail.punishment.reason}</p><p className="mt-1 text-xs">{detail.punishment.revokedAt ? "处罚已解除" : detail.punishment.expiresAt ? `到期：${new Date(detail.punishment.expiresAt).toLocaleString("zh-CN")}` : "长期有效"}</p>{detail.kind === "PUNISHMENT_APPEAL" && detail.status !== "RESOLVED" && detail.status !== "CLOSED" && !detail.punishment.revokedAt && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void decideAppeal("ACCEPT")} disabled={working}>接受申诉并解除处罚</Button><Button size="sm" variant="outline" onClick={() => void decideAppeal("REJECT")} disabled={working}>驳回申诉</Button></div>}</div>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">状态<select value={detail.status} disabled={working} onChange={(event) => void update({ status: event.target.value as SupportStatus })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">{SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>)}</select></label><label className="text-sm">处理人<select value={detail.assignedTo?.id ?? ""} disabled={working} onChange={(event) => void update({ assignedToId: event.target.value || null })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="">未分配</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.nickname || person.id}</option>)}</select></label></div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">{detail.messages.map((message) => <article key={message.id} className={`rounded-lg border p-4 ${message.authorType === "STAFF" ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20" : "bg-muted/20"}`}><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>{message.authorType === "STAFF" ? message.author?.nickname || "工作人员" : "用户"}</span><time>{new Date(message.createdAt).toLocaleString("zh-CN")}</time></div><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p></article>)}</div>
        {detail.status !== "CLOSED" && <form onSubmit={submitReply} className="space-y-3"><label htmlFor="admin-reply" className="text-sm font-medium">客服回复</label><textarea id="admin-reply" value={reply} onChange={(event) => setReply(event.target.value)} required maxLength={5000} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><Button type="submit" disabled={working}>{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}发送并等待用户回复</Button></form>}
      </CardContent></Card>}</div>
    </div>
  </div>;
}
