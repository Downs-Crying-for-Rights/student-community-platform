"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Repeat,
  Play,
  Flag,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDMConsent } from "@/components/dm/DMConsentDialog";

/* ========== Types ========== */

interface CycleLink {
  id: string;
  direction: string;
  status: string;
  description: string | null;
  breakReason: string | null;
  fromUser: { id: string; nickname: string; avatar: string | null };
  toUser: { id: string; nickname: string; avatar: string | null };
}

interface Cycle {
  id: string;
  status: string;
  createdAt: string;
  initiator: { id: string; nickname: string };
  links: CycleLink[];
  mode: "TWO_PARTY" | "THREE_PARTY";
}

/* ========== Constants ========== */

const CYCLE_STATUS: Record<string, { label: string; color: string }> = {
  INITIATING: { label: "组建中", color: "text-amber-600" },
  ACTIVE: { label: "互助中", color: "text-blue-600" },
  COMPLETED: { label: "已完成", color: "text-green-600" },
  BROKEN: { label: "已中断", color: "text-red-600" },
  CLOSED: { label: "已终止", color: "text-slate-600" },
};

const LINK_META: Record<string, { label: string; fromRole: string; toRole: string }> = {
  AB: { label: "A→B", fromRole: "A", toRole: "B" },
  BC: { label: "B→C", fromRole: "B", toRole: "C" },
  CA: { label: "C→A", fromRole: "C", toRole: "A" },
  BA: { label: "B→A", fromRole: "B", toRole: "A" },
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  PENDING_REQUEST: Clock,
  ACCEPTED: CheckCircle2,
  IN_PROGRESS: Play,
  COMPLETED: CheckCircle2,
  REJECTED: XCircle,
  DISPUTED: AlertTriangle,
  CLOSED: XCircle,
};

/* ========== Page ========== */

export default function CycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id;

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [contactLoading, setContactLoading] = useState("");
  const { ensureConsent, dialog: dmConsentDialog } = useDMConsent();

  const fetchCycle = useCallback(async () => {
    try {
      const res = await fetch(`/api/dcr/cycles/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCycle(data.cycle);
      }
    } catch { /* */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchCycle(); }, [fetchCycle]);

  async function handleLinkAction(linkId: string, action: string, reason?: string) {
    setActionError("");
    try {
      const res = await fetch(`/api/dcr/cycles/${id}/links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || "操作失败"); return; }
      fetchCycle();
    } catch { setActionError("网络错误"); }
  }

  function handleDispute(linkId: string) {
    const reason = window.prompt("请填写争议原因，便于管理员处理：");
    if (!reason?.trim()) return;
    void handleLinkAction(linkId, "DISPUTED", reason.trim());
  }

  async function contactCounterpart(linkId: string) {
    setContactLoading(linkId);
    setActionError("");
    try {
      const res = await fetch(`/api/dcr/cycles/${id}/links/${linkId}/dm`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "无法联系对方");
        return;
      }
      router.push(`/messages/dm/${data.thread.id}`);
    } catch {
      setActionError("网络错误");
    } finally {
      setContactLoading("");
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!cycle) {
    return <div className="text-center py-20 text-muted-foreground">互助循环不存在</div>;
  }

  const statusInfo = CYCLE_STATUS[cycle.status] || { label: cycle.status, color: "" };
  const contacts = Array.from(new Map(cycle.links.flatMap((link) => {
    if (link.fromUser.id === userId && link.toUser.id !== userId) return [[link.toUser.id, { user: link.toUser, linkId: link.id }] as const];
    if (link.toUser.id === userId && link.fromUser.id !== userId) return [[link.fromUser.id, { user: link.fromUser, linkId: link.id }] as const];
    return [];
  })).values());

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {dmConsentDialog}
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push("/dcr/cycles")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />返回列表
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{cycle.mode === "TWO_PARTY" ? "双方" : "三方"}互助详情</h1>
          <p className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20">{actionError}</div>
      )}

      {contacts.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">联系其他参与者</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {contacts.map(({ user, linkId }) => (
              <Button
                key={user.id}
                size="sm"
                variant="outline"
                disabled={Boolean(contactLoading)}
                onClick={() => void ensureConsent(() => { void contactCounterpart(linkId); })}
              >
                {contactLoading === linkId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="mr-1 h-3.5 w-3.5" />}
                联系 {user.nickname || "未命名参与者"}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 链路可视化 */}
      <div className="mb-6 rounded-xl bg-slate-50 p-5 dark:bg-slate-900/50 text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-mono">
          <span className="rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-950/40">A</span>
          <ArrowLeft className="h-4 w-4 rotate-180" />
          <span className="rounded-full bg-green-100 px-3 py-1 dark:bg-green-950/40">B</span>
          {cycle.mode === "THREE_PARTY" && <><ArrowLeft className="h-4 w-4 rotate-180" /><span className="rounded-full bg-purple-100 px-3 py-1 dark:bg-purple-950/40">C</span></>}
          <ArrowLeft className="h-4 w-4 rotate-180" />
          <span className="rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-950/40">A</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          发起者: {cycle.initiator.nickname} | 创建于 {new Date(cycle.createdAt).toLocaleString("zh-CN")}
        </p>
      </div>

      {/* 三段链接 */}
      <div className="space-y-3">
        {cycle.links.map((link) => {
          const meta = LINK_META[link.direction] || { label: link.direction, fromRole: "?", toRole: "?" };
          const Icon = STATUS_ICON[link.status] || Clock;
          const isTo = link.toUser.id === userId;
          const isFrom = link.fromUser.id === userId;
          const canAccept = isTo && link.status === "PENDING_REQUEST";
          const canStart = isFrom && link.status === "ACCEPTED";
          const canComplete = isFrom && link.status === "IN_PROGRESS";
          const canDispute = (isFrom || isTo) && ["ACCEPTED", "IN_PROGRESS"].includes(link.status);

          return (
            <Card key={link.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    link.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                    link.status === "DISPUTED" || link.status === "REJECTED" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    <Icon className="h-3 w-3" />
                    {link.status === "PENDING_REQUEST" ? "待回应" :
                     link.status === "ACCEPTED" ? "已接受" :
                     link.status === "IN_PROGRESS" ? "进行中" :
                     link.status === "COMPLETED" ? "已完成" :
                     link.status === "REJECTED" ? "已拒绝" :
                     link.status === "CLOSED" ? "已终止" : "争议中"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
                  <div>
                    <span className="font-medium">{meta.fromRole}{isFrom ? "（你）" : ""}:</span> {link.fromUser.nickname}
                  </div>
                  <div>
                    <span className="font-medium">{meta.toRole}{isTo ? "（你）" : ""}:</span> {link.toUser.nickname}
                  </div>
                </div>

                {link.description && (
                  <p className="text-xs text-muted-foreground mb-2">{link.description}</p>
                )}
                {link.breakReason && (
                  <p className="text-xs text-red-600 mb-2">原因: {link.breakReason}</p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {canAccept && (
                    <>
                      <Button size="sm" variant="default" onClick={() => handleLinkAction(link.id, "ACCEPTED")}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />接受
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleLinkAction(link.id, "REJECTED", "拒绝参与")}>
                        <XCircle className="mr-1 h-3.5 w-3.5" />拒绝
                      </Button>
                    </>
                  )}
                  {canStart && (
                    <Button size="sm" onClick={() => handleLinkAction(link.id, "IN_PROGRESS")}>
                      <Play className="mr-1 h-3.5 w-3.5" />开始互助
                    </Button>
                  )}
                  {canComplete && (
                    <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => handleLinkAction(link.id, "COMPLETED")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />完成互助
                    </Button>
                  )}
                  {canDispute && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDispute(link.id)}>
                      <Flag className="mr-1 h-3.5 w-3.5" />争议
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
