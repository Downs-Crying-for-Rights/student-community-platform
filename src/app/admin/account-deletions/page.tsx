"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RequestItem = {
  id: string; reason: string | null; requestedAt: string;
  user: { id: string; nickname: string | null; email: string | null; role: string; createdAt: string };
};

export default function AccountDeletionsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/account-deletions", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRequests(data.requests ?? []); else setError(data.error || "加载失败");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function review(id: string, action: "reject" | "approve") {
    const note = notes[id]?.trim();
    if (!note) { setError("请填写审核说明"); return; }
    if (action === "approve" && !window.confirm("批准后账号将立即匿名化并停用，确认继续？")) return;
    const response = await fetch(`/api/admin/account-deletions/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error || "处理失败"); return; }
    await load();
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">账号注销审核</h1><p className="mt-1 text-sm text-muted-foreground">批准后清除个人身份和登录信息，公共内容保留为已注销用户。</p></div>
      {error && <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {loading ? <p>加载中...</p> : requests.length === 0 ? <p className="text-muted-foreground">暂无待审核注销申请</p> : requests.map((item) => (
        <Card key={item.id}>
          <CardHeader><CardTitle className="text-base">{item.user.nickname || "未命名用户"} · {item.user.role}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>邮箱：{item.user.email || "未设置"}</p><p>申请时间：{new Date(item.requestedAt).toLocaleString("zh-CN")}</p><p>用户说明：{item.reason || "未填写"}</p>
            <textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1000} className="min-h-20 w-full rounded-md border p-3" placeholder="审核说明（必填）" />
            <div className="flex gap-2"><Button variant="outline" onClick={() => review(item.id, "reject")}>拒绝</Button><Button variant="destructive" onClick={() => review(item.id, "approve")}>批准注销</Button></div>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
