"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  revision: number;
  forcePopup: boolean;
  isPublished: boolean;
  createdAt: string;
  deliveredCount: number;
  failedCount: number;
  _count: { receipts: number; deliveries: number };
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [forcePopup, setForcePopup] = useState(true);
  const [sendDm, setSendDm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/announcements", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setItems(data.announcements ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (sendDm && !window.confirm("确认向所有已同意私信巡查授权的非封禁用户群发此公告？")) return;
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, forcePopup, sendDm }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.error || "发布失败");
    else {
      let broadcast = data.broadcast;
      let delivered = broadcast?.delivered ?? 0;
      let failed = broadcast?.failed ?? 0;
      let broadcastError = "";
      while (broadcast?.remaining > 0) {
        const processResponse = await fetch(`/api/admin/announcements/${data.announcement.id}/process`, { method: "POST" });
        const processData = await processResponse.json().catch(() => ({}));
        if (!processResponse.ok) {
          broadcastError = processData.error || "公告已发布，但私信群发未完成，可稍后重试";
          break;
        }
        delivered += processData.delivered ?? 0;
        failed += processData.failed ?? 0;
        broadcast = processData;
      }
      setMessage(broadcastError || (broadcast ? `公告已发布，私信成功 ${delivered} 条，失败 ${failed} 条` : "公告已发布"));
      setTitle("");
      setContent("");
      setSendDm(false);
      await load();
    }
    setLoading(false);
  }

  async function toggle(item: AnnouncementItem, field: "isPublished" | "forcePopup") {
    const response = await fetch(`/api/admin/announcements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !item[field] }),
    });
    if (response.ok) await load();
  }

  async function continueBroadcast(item: AnnouncementItem) {
    setLoading(true);
    setMessage("");
    let delivered = 0;
    let failed = 0;
    while (true) {
      const response = await fetch(`/api/admin/announcements/${item.id}/process`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "继续群发失败");
        break;
      }
      delivered += data.delivered ?? 0;
      failed += data.failed ?? 0;
      if (!data.remaining) {
        setMessage(`本次私信成功 ${delivered} 条，失败 ${failed} 条`);
        break;
      }
    }
    await load();
    setLoading(false);
  }

  return <div className="container mx-auto max-w-6xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">公告管理</h1><p className="mt-1 text-sm text-muted-foreground">强制弹窗需用户明确确认；私信群发仅投递给已同意私信巡查授权的用户。</p></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>发布公告</CardTitle></CardHeader><CardContent>
        <form onSubmit={create} className="space-y-4">
          <div><Label htmlFor="announcement-title">标题</Label><Input id="announcement-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></div>
          <div><Label htmlFor="announcement-content">内容（Markdown）</Label><textarea id="announcement-content" value={content} onChange={(event) => setContent(event.target.value)} rows={12} maxLength={20000} required className="mt-1 w-full rounded-md border bg-background p-3 text-sm" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={forcePopup} onChange={(event) => setForcePopup(event.target.checked)} />强制弹窗</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sendDm} onChange={(event) => setSendDm(event.target.checked)} />同时私信群发</label>
          {message && <p className="text-sm" role="status">{message}</p>}
          <Button type="submit" disabled={loading}>{loading ? "发布并投递中..." : "发布公告"}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>预览</CardTitle></CardHeader><CardContent><h2 className="mb-4 text-xl font-semibold">{title || "公告标题"}</h2><SafeMarkdown content={content || "公告内容将在这里预览。"} /></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>历史公告</CardTitle></CardHeader><CardContent className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">版本 {item.revision} · 弹窗确认 {item._count.receipts} · 私信 {item.deliveredCount}/{item._count.deliveries}{item.failedCount > 0 ? `（失败 ${item.failedCount}）` : ""}</div></div><div className="flex flex-wrap gap-2">{item._count.deliveries > item.deliveredCount && <Button size="sm" variant="outline" disabled={loading} onClick={() => void continueBroadcast(item)}>继续群发</Button>}<Button size="sm" variant="outline" onClick={() => void toggle(item, "forcePopup")}>{item.forcePopup ? "关闭弹窗" : "开启弹窗"}</Button><Button size="sm" variant="outline" onClick={() => void toggle(item, "isPublished")}>{item.isPublished ? "下线" : "重新发布"}</Button></div></div></div>)}{items.length === 0 && <p className="text-sm text-muted-foreground">暂无公告</p>}</CardContent></Card>
  </div>;
}
