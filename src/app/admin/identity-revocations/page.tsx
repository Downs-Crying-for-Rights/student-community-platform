"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type RequestItem = {
  id: string; scope: "STUDENT" | "ALL"; status: Status; reason: string; reviewNote: string | null; requestedAt: string;
  user: { id: string; nickname: string | null; realVerifiedAt: string | null; studentVerifiedAt: string | null };
};

export default function IdentityRevocationsPage() {
  const [status, setStatus] = useState<Status>("PENDING");
  const [items, setItems] = useState<RequestItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch(`/api/admin/identity-revocations?status=${status}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setItems(data.requests || []); else setMessage(data.error || "撤销申请加载失败");
    setLoading(false);
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  async function review(item: RequestItem, decision: "APPROVED" | "REJECTED") {
    const reviewNote = notes[item.id]?.trim();
    if (decision === "REJECTED" && !reviewNote) { setMessage("拒绝时必须填写审核说明"); return; }
    setBusy(item.id); setMessage("");
    const response = await fetch(`/api/admin/identity-revocations/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: decision, reviewNote }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) await load(); else setMessage(data.error || "审核失败");
    setBusy("");
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldX className="h-6 w-6" />身份认证撤销审核</h1><p className="mt-1 text-sm text-muted-foreground">全部撤销会清除已实名和学生用户标签，但保留身份防重复校验记录。</p></div>
      <div className="flex gap-2">{(["PENDING", "APPROVED", "REJECTED"] as Status[]).map((value) => <Button key={value} variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>{value === "PENDING" ? "待审核" : value === "APPROVED" ? "已通过" : "已拒绝"}</Button>)}</div>
      {message && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message}</p>}
      <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">申请人</th><th className="p-3 text-left">撤销范围</th><th className="p-3 text-left">原因</th><th className="p-3 text-left">申请时间</th><th className="p-3 text-left">审核</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b align-top"><td className="p-3"><a href={`/u/${item.user.id}`} className="font-medium text-primary hover:underline">{item.user.nickname || item.user.id}</a><p className="mt-1 text-xs text-muted-foreground">当前标签：{item.user.realVerifiedAt ? "已实名 " : ""}{item.user.studentVerifiedAt ? "学生用户" : "无"}</p></td><td className="p-3">{item.scope === "STUDENT" ? "仅学生认证" : "全部认证"}</td><td className="max-w-xs whitespace-pre-wrap p-3">{item.reason}</td><td className="p-3 text-muted-foreground">{new Date(item.requestedAt).toLocaleString("zh-CN")}</td><td className="space-y-2 p-3">{item.status === "PENDING" && <><Input placeholder="审核说明（拒绝时必填）" value={notes[item.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} /><div className="flex gap-2"><Button size="sm" disabled={busy === item.id} onClick={() => void review(item, "APPROVED")}>批准撤销</Button><Button size="sm" variant="destructive" disabled={busy === item.id} onClick={() => void review(item, "REJECTED")}>拒绝</Button></div></>}{item.reviewNote && <p className="text-xs text-muted-foreground">审核说明：{item.reviewNote}</p>}</td></tr>)}
        {!loading && items.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">暂无申请</td></tr>}
      </tbody></table>{loading && <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}</div></CardContent></Card>
    </main>
  );
}
