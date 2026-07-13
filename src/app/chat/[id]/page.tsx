"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Send, LogIn, Users, Hash, Lock, Shield, Settings, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
}
interface Member {
  id: string; nickname: string; avatar: string | null; role: string;
}
interface RoomInfo {
  id: string;
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE";
  joinMode: string;
  createdBy: { id: string; nickname: string; avatar: string | null };
  members: Member[];
  memberCount: number;
}

export default function ChatRoomPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [manageTab, setManageTab] = useState<"members" | "requests" | "settings">("members");
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOwner = room?.createdBy.id === userId;
  const ownerOrAdmin = isOwner || room?.members.some((m) => m.id === userId && (m.role === "OWNER" || m.role === "ADMIN"));

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`);
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        return;
      }
      const data = await res.json();
      setRoom(data.room);
      setIsMember(data.room.members.some((m: Member) => m.id === userId));
      if (!data.room.members.some((m: Member) => m.id === userId) && data.room.joinMode === "APPROVAL") {
        try {
          const reqRes = await fetch(`/api/chat/rooms/${roomId}/join-requests`);
          if (reqRes.ok) {
            const reqData = await reqRes.json();
            const myReq = reqData.requests?.find((r: any) => r.userId === userId);
            if (myReq) setRequestStatus(myReq.status);
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, [roomId, userId, router]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=50`);
      if (res.status === 403) { setIsMember(false); return; }
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [roomId]);

  const fetchJoinRequests = useCallback(async () => {
    if (!ownerOrAdmin) return;
    setManageLoading(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/join-requests`);
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(data.requests ?? []);
      }
    } catch { /* ignore */ } finally {
      setManageLoading(false);
    }
  }, [roomId, ownerOrAdmin]);

  useEffect(() => { fetchRoom(); fetchMessages(); }, [fetchRoom, fetchMessages]);
  useEffect(() => {
    intervalRef.current = setInterval(fetchMessages, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMessages]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (res.ok) { setInput(""); fetchMessages(); }
      else { const data = await res.json(); alert(data.error || "发送失败"); }
    } catch { /* ignore */ } finally { setSending(false); }
  }

  async function handleJoin() {
    setJoining(true);
    try {
      const url = room?.joinMode === "APPROVAL"
        ? `/api/chat/rooms/${roomId}/join-requests`
        : `/api/chat/rooms/${roomId}`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        if (room?.joinMode === "APPROVAL") { setRequestStatus("PENDING"); }
        else { setIsMember(true); fetchMessages(); }
        fetchRoom();
      } else {
        const data = await res.json();
        alert(data.error || "加入失败");
      }
    } catch { /* ignore */ } finally { setJoining(false); }
  }

  async function handleApproveRequest(reqId: string) {
    try {
      await fetch(`/api/chat/rooms/${roomId}/join-requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVED" }),
      });
      fetchJoinRequests(); fetchRoom();
    } catch { /* ignore */ }
  }

  async function handleRejectRequest(reqId: string) {
    try {
      await fetch(`/api/chat/rooms/${roomId}/join-requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECTED" }),
      });
      fetchJoinRequests();
    } catch { /* ignore */ }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("确定要移除此成员吗？")) return;
    try {
      await fetch(`/api/chat/rooms/${roomId}/members/${memberId}`, { method: "DELETE" });
      fetchRoom();
    } catch { /* ignore */ }
  }

  function isOwnMessage(msg: Message) { return msg.senderId === userId; }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/chat")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {room?.type === "PRIVATE" ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Hash className="h-3.5 w-3.5 text-muted-foreground" />}
            <h1 className="text-sm font-semibold truncate">{room?.name ?? "加载中..."}</h1>
          </div>
          <p className="text-xs text-muted-foreground">{room?.memberCount ?? 0} 名成员{room?.description ? ` · ${room.description}` : ""}</p>
        </div>
        {!isMember && room?.type === "PUBLIC" && (
          <Button size="sm" onClick={handleJoin} disabled={joining}>
            <LogIn className="mr-1 h-4 w-4" />{joining ? "..." : room?.joinMode === "APPROVAL" ? "申请加入" : "加入"}
          </Button>
        )}
        {requestStatus === "PENDING" && <span className="text-xs text-amber-600 px-2 py-1 rounded">审核中</span>}
        {requestStatus === "REJECTED" && (
          <span className="text-xs text-red-600 px-2 py-1 rounded">
            已拒绝 · <button onClick={handleJoin} className="underline">重试</button>
          </span>
        )}
        {ownerOrAdmin && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setManageTab("members"); setShowManage(true); fetchJoinRequests(); }}>
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages area — fills remaining space */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" aria-live="polite" role="log">
        {!isMember ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Lock className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{room?.type === "PRIVATE" ? "私密群聊" : "加入群聊以查看和发送消息"}</p>
            {room?.type === "PUBLIC" && <Button onClick={handleJoin} disabled={joining}><LogIn className="mr-1 h-4 w-4" />{joining ? "..." : "加入群聊"}</Button>}
          </div>
        ) : messages.length === 0 ? (
          <p className="flex items-center justify-center h-full text-sm text-muted-foreground">暂无消息，发送第一条消息吧</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${isOwnMessage(msg) ? "justify-end" : "justify-start"}`}>
              <Card className={`max-w-[75%] px-3 py-1.5 ${isOwnMessage(msg) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] mt-0.5 ${isOwnMessage(msg) ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Fixed input bar at bottom */}
      {isMember && (
        <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-border/40 px-3 py-2 bg-background">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            maxLength={5000}
            className="flex-1 h-9"
            autoComplete="off"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}

      {/* Management Dialog */}
      <Dialog open={showManage} onOpenChange={setShowManage}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>管理群聊</DialogTitle>
            <DialogDescription>{room?.name}</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 border-b mb-2">
            {["members", "requests", "settings"].map((tab) => (
              <button key={tab} onClick={() => setManageTab(tab as any)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${manageTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {tab === "members" ? "成员" : tab === "requests" ? `申请(${joinRequests.length})` : "设置"}
              </button>
            ))}
          </div>

          {manageTab === "members" && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {room?.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{m.nickname ?? "未知"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{m.role}</span>
                  </div>
                  {m.id !== userId && isOwner && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveMember(m.id)}>
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {manageTab === "requests" && (
            manageLoading ? <p className="py-4 text-center text-sm text-muted-foreground">加载中...</p> :
            joinRequests.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">暂无待处理的加入申请</p> :
            <div className="max-h-60 overflow-y-auto space-y-2">
              {joinRequests.filter((r: any) => r.status === "PENDING").map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                  <span className="text-sm">{r.user?.nickname ?? "未知用户"}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApproveRequest(r.id)}>通过</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleRejectRequest(r.id)}>拒绝</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {manageTab === "settings" && (
            <div className="space-y-2 py-2">
              <p className="text-sm"><span className="text-muted-foreground">群聊类型：</span>{room?.type === "PUBLIC" ? "公开" : "私密"}</p>
              <p className="text-sm"><span className="text-muted-foreground">加入方式：</span>{room?.joinMode === "APPROVAL" ? "审核加入" : "自由加入"}</p>
              <p className="text-sm"><span className="text-muted-foreground">创建者：</span>{room?.createdBy.nickname ?? "未知"}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowManage(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
