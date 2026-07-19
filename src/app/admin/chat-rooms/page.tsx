"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Hash, Lock, MessageSquare, Users, X } from "lucide-react";

import { AiReviewPanel } from "@/components/admin/AiReviewPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ReviewStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type RoomType = "ALL" | "PUBLIC" | "PRIVATE";

interface ReviewRoom {
  id: string;
  name: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE";
  status: Exclude<ReviewStatus, "ALL">;
  joinMode: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; nickname: string | null; avatar: string | null };
  _count: { members: number; messages: number };
}

interface ReviewMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  sender: { id: string; nickname: string | null };
}

const statusLabels: Record<ReviewStatus, string> = {
  ALL: "全部状态",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

export default function ChatRoomReviewPage() {
  const [status, setStatus] = useState<ReviewStatus>("ALL");
  const [type, setType] = useState<RoomType>("ALL");
  const [rooms, setRooms] = useState<ReviewRoom[]>([]);
  const [selected, setSelected] = useState<ReviewRoom | null>(null);
  const [messages, setMessages] = useState<ReviewMessage[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePages, setMessagePages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/chat-rooms?status=${status}&type=${type}&pageSize=100`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载群聊巡查列表失败");
      setRooms(data.rooms || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载群聊巡查列表失败");
    } finally {
      setLoading(false);
    }
  }, [status, type]);

  const inspect = useCallback(async (room: ReviewRoom, page = 1) => {
    setSelected(room);
    setMessagesLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/chat-rooms/${room.id}?page=${page}&pageSize=50`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载群聊消息失败");
      setMessages(data.messages || []);
      setMessagePage(data.page || 1);
      setMessagePages(data.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载群聊消息失败");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  async function review(room: ReviewRoom, action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !reason.trim()) return setError("请填写拒绝原因");
    setActingId(room.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/chat-rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "审核失败");
      setRejectingId(null);
      setReason("");
      setSelected(null);
      setMessages([]);
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">群聊巡查</h1>
      <p className="mb-5 text-sm text-muted-foreground">管理员可巡查全部公开和私密群聊内容；每次打开群聊消息都会写入审计日志。</p>

      <div className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(statusLabels) as ReviewStatus[]).map((item) => (
          <Button key={item} size="sm" variant={status === item ? "default" : "outline"} onClick={() => { setStatus(item); setSelected(null); setMessages([]); }}>{statusLabels[item]}</Button>
        ))}
        <span className="mx-1 h-8 w-px bg-border" />
        {(["ALL", "PUBLIC", "PRIVATE"] as RoomType[]).map((item) => (
          <Button key={item} size="sm" variant={type === item ? "secondary" : "outline"} onClick={() => { setType(item); setSelected(null); setMessages([]); }}>
            {item === "ALL" ? "全部类型" : item === "PUBLIC" ? "公开群聊" : "私密群聊"}
          </Button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(420px,1.15fr)]">
        <section>
          {loading ? <ListSkeleton count={5} /> : rooms.length === 0 ? (
            <EmptyState title="暂无匹配群聊" description="当前筛选条件下没有群聊" />
          ) : <div className="space-y-3">{rooms.map((room) => (
            <Card key={room.id} className={selected?.id === room.id ? "border-primary" : undefined}>
              <CardContent className="p-4">
                <button type="button" className="w-full text-left" onClick={() => void inspect(room)}>
                  <div className="flex items-center gap-2">
                    {room.type === "PRIVATE" ? <Lock className="h-4 w-4 text-amber-600" /> : <Hash className="h-4 w-4 text-primary" />}
                    <h2 className="min-w-0 flex-1 truncate font-semibold">{room.name}</h2>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{room.type === "PRIVATE" ? "私密" : statusLabels[room.status]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{room.description || "无群聊简介"}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>创建者：{room.createdBy.nickname || room.createdBy.id}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{room._count.members} 人</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{room._count.messages} 条消息</span>
                  </div>
                </button>

                {room.type === "PUBLIC" && room.status === "PENDING" && <div className="mt-4 space-y-3 border-t pt-4">
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void review(room, "APPROVE")} disabled={actingId === room.id}><Check className="mr-1 h-4 w-4" />通过</Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectingId(room.id)} disabled={actingId === room.id}><X className="mr-1 h-4 w-4" />拒绝</Button>
                  </div>
                  <AiReviewPanel targetType="CHAT_ROOM" targetId={room.id} onUseReason={(value) => { setRejectingId(room.id); setReason(value); }} />
                  {rejectingId === room.id && <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="填写拒绝原因" maxLength={500} />
                    <Button variant="destructive" onClick={() => void review(room, "REJECT")}>确认拒绝</Button>
                  </div>}
                </div>}
              </CardContent>
            </Card>
          ))}</div>}
        </section>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader><CardTitle className="text-base">{selected ? `巡查内容：${selected.name}` : "群聊内容"}</CardTitle></CardHeader>
          <CardContent>
            {!selected ? <p className="text-sm text-muted-foreground">选择左侧群聊查看消息，包括私密群聊。</p> : messagesLoading ? <ListSkeleton count={5} /> : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">该群聊暂无消息</p>
            ) : <div className="space-y-3">{messages.slice().reverse().map((message) => (
              <div key={message.id} className="rounded-lg bg-muted p-3 text-sm">
                <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{message.sender.nickname || message.sender.id}</span>
                  <span>{new Date(message.createdAt).toLocaleString("zh-CN")}{message.editedAt ? " · 已编辑" : ""}</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            ))}</div>}
            {selected && messagePages > 1 && <div className="mt-4 flex items-center justify-between border-t pt-4">
              <Button size="sm" variant="outline" disabled={messagePage <= 1 || messagesLoading} onClick={() => void inspect(selected, messagePage - 1)}><ChevronLeft className="h-4 w-4" />较新</Button>
              <span className="text-xs text-muted-foreground">第 {messagePage} / {messagePages} 页</span>
              <Button size="sm" variant="outline" disabled={messagePage >= messagePages || messagesLoading} onClick={() => void inspect(selected, messagePage + 1)}>更早<ChevronRight className="h-4 w-4" /></Button>
            </div>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
