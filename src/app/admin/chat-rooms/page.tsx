"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Hash, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

interface ReviewRoom {
  id: string;
  name: string;
  description: string | null;
  status: ReviewStatus;
  joinMode: string;
  createdAt: string;
  createdBy: { id: string; nickname: string | null; avatar: string | null };
  _count: { members: number; messages: number };
}

const statusLabels: Record<ReviewStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

export default function ChatRoomReviewPage() {
  const [status, setStatus] = useState<ReviewStatus>("PENDING");
  const [rooms, setRooms] = useState<ReviewRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/chat-rooms?status=${status}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载审核队列失败");
      setRooms(data.rooms || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载审核队列失败");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  async function review(room: ReviewRoom, action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !reason.trim()) {
      setError("请填写拒绝原因");
      return;
    }
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
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-screen-lg px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">群聊审核</h1>
      <p className="mb-6 text-sm text-muted-foreground">公开群聊通过平台审核后，才会出现在所有用户的群聊列表中。</p>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="群聊审核状态">
        {(Object.keys(statusLabels) as ReviewStatus[]).map((item) => (
          <Button key={item} size="sm" variant={status === item ? "default" : "outline"} onClick={() => setStatus(item)}>
            {statusLabels[item]}
          </Button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

      {loading ? <ListSkeleton count={4} /> : rooms.length === 0 ? (
        <EmptyState title={`暂无${statusLabels[status]}群聊`} description="当前审核队列为空" />
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold">{room.name}</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{room.description || "无群聊简介"}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>创建者：{room.createdBy.nickname || room.createdBy.id}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{room._count.members} 人</span>
                      <span>{room.joinMode === "APPROVAL" ? "审核加入" : "自由加入"}</span>
                      <span>{new Date(room.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                  </div>

                  {room.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => void review(room, "APPROVE")} disabled={actingId === room.id}>
                        <Check className="mr-1 h-4 w-4" />通过
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRejectingId(room.id)} disabled={actingId === room.id}>
                        <X className="mr-1 h-4 w-4" />拒绝
                      </Button>
                    </div>
                  )}
                </div>

                {rejectingId === room.id && (
                  <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row">
                    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="填写拒绝原因" maxLength={500} />
                    <Button variant="destructive" onClick={() => void review(room, "REJECT")} disabled={actingId === room.id}>确认拒绝</Button>
                    <Button variant="ghost" onClick={() => { setRejectingId(null); setReason(""); }}>取消</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
