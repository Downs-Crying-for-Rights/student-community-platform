"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Eye, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type Item = {
  id: string;
  method: "STUDENT_DOCUMENT" | "ID_HOLDING_PHOTO" | "SCHOOL_UNIFORM" | "REAL_NAME_ID";
  status: Status;
  reviewNote: string | null;
  createdAt: string;
  hasEvidence: boolean;
  hasIdentityDetails: boolean;
  applicant: { id: string; nickname: string | null; realVerifiedAt: string | null; studentVerifiedAt: string | null };
};

const METHOD_LABELS: Record<Item["method"], string> = {
  STUDENT_DOCUMENT: "学生证件合照",
  ID_HOLDING_PHOTO: "手持身份证半身照",
  SCHOOL_UNIFORM: "学校校服半身照",
  REAL_NAME_ID: "姓名 + 身份证号",
};

export default function IdentityVerificationReviewPage() {
  const [status, setStatus] = useState<Status>("PENDING");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ item: Item; url?: string; realName?: string; idNumber?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch(`/api/admin/identity-verifications?status=${status}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setItems(data.applications || []); else setMessage(data.error || "认证申请加载失败");
    setLoading(false);
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function inspect(item: Item) {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    if (item.hasEvidence) {
      const response = await fetch(`/api/admin/identity-verifications/${item.id}/evidence`, { cache: "no-store" });
      if (!response.ok) { setMessage("认证材料读取失败"); return; }
      setPreview({ item, url: URL.createObjectURL(await response.blob()) });
      return;
    }
    const response = await fetch(`/api/admin/identity-verifications/${item.id}/details`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error || "实名信息读取失败"); return; }
    setPreview({ item, realName: data.realName, idNumber: data.idNumber });
  }

  async function review(item: Item, decision: "APPROVED" | "REJECTED") {
    const reviewNote = note[item.id]?.trim();
    if (decision === "REJECTED" && !reviewNote) { setMessage("拒绝时必须填写原因"); return; }
    setActionId(item.id); setMessage("");
    const response = await fetch(`/api/admin/identity-verifications/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision, reviewNote: reviewNote || undefined }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.error || "审核失败");
    else { setPreview(null); await load(); }
    setActionId("");
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6" />身份认证审核</h1><p className="mt-1 text-sm text-muted-foreground">材料和实名信息仅限管理员按需查看，每次查看均写入审计日志。</p></div>
      <div className="flex gap-2">{(["PENDING", "APPROVED", "REJECTED"] as Status[]).map((value) => <Button key={value} variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>{value === "PENDING" ? "待审核" : value === "APPROVED" ? "已通过" : "已拒绝"}</Button>)}</div>
      {message && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message}</p>}
      <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">申请人</th><th className="p-3 text-left">方式</th><th className="p-3 text-left">申请时间</th><th className="p-3 text-left">审核</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b align-top"><td className="p-3"><a className="font-medium text-primary hover:underline" href={`/u/${item.applicant.id}`}>{item.applicant.nickname || item.applicant.id}</a><p className="mt-1 text-xs text-muted-foreground">现有标签：{item.applicant.realVerifiedAt ? "真实用户 " : ""}{item.applicant.studentVerifiedAt ? "学生用户" : "无"}</p></td><td className="p-3">{METHOD_LABELS[item.method]}</td><td className="p-3 text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td className="space-y-2 p-3"><Button size="sm" variant="outline" onClick={() => void inspect(item)}><Eye className="h-4 w-4" />查看认证材料</Button>{item.status === "PENDING" && <><Input placeholder="拒绝原因或审核备注" value={note[item.id] || ""} onChange={(event) => setNote((current) => ({ ...current, [item.id]: event.target.value }))} /><div className="flex gap-2"><Button size="sm" disabled={actionId === item.id} onClick={() => void review(item, "APPROVED")}>通过</Button><Button size="sm" variant="destructive" disabled={actionId === item.id} onClick={() => void review(item, "REJECTED")}>拒绝</Button></div></>}{item.reviewNote && <p className="text-xs text-muted-foreground">备注：{item.reviewNote}</p>}</td></tr>)}
        {!loading && items.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">暂无申请</td></tr>}
      </tbody></table>{loading && <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>}</div></CardContent></Card>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null); } }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>认证材料</DialogTitle></DialogHeader>{preview?.url && <div className="relative h-[65vh] overflow-hidden rounded-lg bg-muted"><Image src={preview.url} alt="身份认证材料" fill unoptimized className="object-contain" /></div>}{preview?.realName && <div className="space-y-3 rounded-lg border p-5"><p><span className="text-muted-foreground">姓名：</span>{preview.realName}</p><p><span className="text-muted-foreground">身份证号：</span><span className="font-mono">{preview.idNumber}</span></p><p className="text-xs text-destructive">仅用于本次人工审核，禁止复制、截图或外传。</p></div>}</DialogContent></Dialog>
    </main>
  );
}
