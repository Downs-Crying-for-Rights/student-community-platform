"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LifeBuoy, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support-ticket";

interface Ticket {
  id: string;
  kind: "GENERAL" | "PUNISHMENT_APPEAL";
  subject: string;
  status: SupportStatus;
  updatedAt: string;
  assignedTo: { id: string; nickname: string | null } | null;
}
interface ActivePunishment { id: string; type: string; reason: string; expiresAt: string | null }

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePunishments, setActivePunishments] = useState<ActivePunishment[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/support", { cache: "no-store" }), fetch("/api/punishments/status", { cache: "no-store" })])
      .then(async ([ticketResponse, punishmentResponse]) => {
        const data = await ticketResponse.json().catch(() => ({}));
        if (!ticketResponse.ok) throw new Error(data.error || "加载客服工单失败");
        const punishmentData = punishmentResponse.ok ? await punishmentResponse.json() : {};
        setTickets(data.tickets ?? []);
        setActivePunishments(punishmentData.activePunishments ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "加载客服工单失败"))
      .finally(() => setLoading(false));
  }, []);

  async function appeal(punishment: ActivePunishment) {
    const content = window.prompt("请说明处罚需要复核的原因：");
    if (!content?.trim()) return;
    const response = await fetch(`/api/punishments/${punishment.id}/appeal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || "申诉提交失败"); return; }
    window.location.href = `/support/${data.ticket.id}`;
  }

  return <div className="mx-auto max-w-3xl px-4 py-8">
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><LifeBuoy className="h-6 w-6" />客服支持</h1>
        <p className="mt-1 text-sm text-muted-foreground">提交账户或平台使用问题，并与工作人员持续沟通。</p>
      </div>
      <Button asChild><Link href="/support/new"><Plus className="h-4 w-4" />新建工单</Link></Button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {activePunishments.length > 0 && <Card className="mb-5 border-amber-300"><CardContent className="space-y-3 p-4"><h2 className="font-semibold">当前有效处罚</h2>{activePunishments.map((punishment) => <div key={punishment.id} className="flex flex-col justify-between gap-3 rounded-md bg-muted/50 p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">{punishment.type}</p><p className="mt-1 text-xs text-muted-foreground">{punishment.reason}{punishment.expiresAt ? ` · 到期 ${new Date(punishment.expiresAt).toLocaleString("zh-CN")}` : ""}</p></div><Button size="sm" variant="outline" onClick={() => void appeal(punishment)}>提交申诉</Button></div>)}</CardContent></Card>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">加载中</span></div>
      : tickets.length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground">暂无客服工单</CardContent></Card>
        : <div className="space-y-3">{tickets.map((ticket) => <Link key={ticket.id} href={`/support/${ticket.id}`} className="block">
          <Card className="transition-colors hover:border-primary/40"><CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0"><h2 className="truncate font-medium">{ticket.kind === "PUNISHMENT_APPEAL" ? "[处罚申诉] " : ""}{ticket.subject}</h2><p className="mt-1 text-xs text-muted-foreground">更新于 {new Date(ticket.updatedAt).toLocaleString("zh-CN")}{ticket.assignedTo ? ` · ${ticket.assignedTo.nickname || "工作人员"} 处理` : ""}</p></div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs">{SUPPORT_STATUS_LABELS[ticket.status]}</span>
          </CardContent></Card>
        </Link>)}</div>}
  </div>;
}
