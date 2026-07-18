"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Send, LogIn, Users, Hash, Lock, Settings, UserX, BellOff, Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const PAGE_SIZE = 30;

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: { id: string; nickname: string | null; avatar: string | null };
}

interface Member {
  id: string; nickname: string; avatar: string | null; role: string;
}

interface RoomInfo {
  id: string;
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE";
  status: "PENDING" | "APPROVED" | "REJECTED";
  joinMode: string;
  createdBy: { id: string; nickname: string; avatar: string | null };
  members: Member[];
  memberCount: number;
}

function lsMutedRooms(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem("chat_muted") || "[]")); } catch { return new Set(); }
}
function toggleMute(roomId: string): boolean {
  const s = lsMutedRooms();
  if (s.has(roomId)) { s.delete(roomId); } else { s.add(roomId); }
  localStorage.setItem("chat_muted", JSON.stringify([...s]));
  return !s.has(roomId); // returns true if now muted
}
function isMuted(roomId: string): boolean { return lsMutedRooms().has(roomId); }

function lsLastRead(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("chat_last_read") || "{}"); } catch { return {}; }
}
function setLastRead(roomId: string, msgId: string) {
  const d = lsLastRead();
  d[roomId] = msgId;
  localStorage.setItem("chat_last_read", JSON.stringify(d));
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
  const [manageError, setManageError] = useState("");
  const [muted, setMuted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isNearBottomRef = useRef(true);

  const isOwner = room?.createdBy.id === userId;
  const ownerOrAdmin = isOwner || room?.members.some((m) => m.id === userId && (m.role === "OWNER" || m.role === "ADMIN"));

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`);
      if (!res.ok) { if (res.status === 401) { router.push("/login"); } return; }
      const data = await res.json();
      setRoom(data.room);
      setIsMember(data.room.members.some((m: Member) => m.id === userId));
      setMuted(isMuted(roomId));
    } catch { /* ignore */ }
  }, [roomId, userId, router]);

  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (before) params.set("before", before);
      const res = await fetch(`/api/chat/rooms/${roomId}/messages?${params}`);
      if (res.status === 403) { setIsMember(false); return; }
      if (!res.ok) return;
      const data = await res.json();
      if (before) {
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.messages.length >= PAGE_SIZE);
      } else {
        setMessages(data.messages);
        setHasMore(data.messages.length >= PAGE_SIZE);
        // Mark last read
        if (data.messages.length > 0) setLastRead(roomId, data.messages[data.messages.length - 1].id);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [roomId]);

  const pollNewMessages = useCallback(async () => {
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages?after=${lastId}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
        setLastRead(roomId, data.messages[data.messages.length - 1].id);
      }
    } catch { /* ignore */ }
  }, [roomId, messages]);

  const fetchJoinRequests = useCallback(async () => {
    if (!ownerOrAdmin) return;
    setManageLoading(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/join-requests`);
      if (res.ok) setJoinRequests((await res.json()).requests ?? []);
    } catch { /* ignore */ } finally { setManageLoading(false); }
  }, [roomId, ownerOrAdmin]);

  useEffect(() => { fetchRoom(); fetchMessages(); }, [fetchRoom, fetchMessages]);

  useEffect(() => {
    intervalRef.current = setInterval(pollNewMessages, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pollNewMessages]);

  // Smart scroll: only auto-scroll if user was already near bottom
  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    isNearBottomRef.current = nearBottom;

    // Load older messages when scrolled to top
    if (el.scrollTop < 50 && !loadingMore && hasMore) {
      setLoadingMore(true);
      fetchMessages(messages[0]?.id);
    }
  }, [messages, loadingMore, hasMore, fetchMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setInput("");
        setMessages((current) => current.some((message) => message.id === data.message.id)
          ? current
          : [...current, data.message]);
        setLastRead(roomId, data.message.id);
        isNearBottomRef.current = true;
      }
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
      } else { const data = await res.json(); alert(data.error || "加入失败"); }
    } catch { /* ignore */ } finally { setJoining(false); }
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
    <div className="fixed inset-x-0 bottom-16 top-14 flex flex-col bg-background lg:bottom-0 lg:left-60">
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
        {/* Mute toggle */}
        {isMember && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { toggleMute(roomId); setMuted(!muted); }}
            title={muted ? "取消免打扰" : "开启免打扰"}>
            {muted ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4" />}
          </Button>
        )}
        {!isMember && room?.type === "PUBLIC" && (
          <Button size="sm" onClick={handleJoin} disabled={joining}>
            <LogIn className="mr-1 h-4 w-4" />{joining ? "..." : room?.joinMode === "APPROVAL" ? "申请加入" : "加入"}
          </Button>
        )}
        {requestStatus === "PENDING" && <span className="text-xs text-amber-600 px-2 py-1 rounded">审核中</span>}
        {ownerOrAdmin && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setManageTab("members"); setShowManage(true); fetchJoinRequests(); }}>
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" role="log">
        {loadingMore && (
          <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        )}
        {room?.status !== "APPROVED" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Lock className="h-10 w-10 text-amber-500/60" />
            <p className="text-sm font-medium">{room?.status === "REJECTED" ? "该群聊未通过平台审核" : "该群聊正在等待平台审核"}</p>
            <p className="text-xs text-muted-foreground">审核通过后才能加入和发送消息</p>
          </div>
        ) : !isMember ? (
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
                <Link
                  href={`/u/${msg.sender.id}`}
                  className={`mb-0.5 block text-[11px] font-medium hover:underline ${isOwnMessage(msg) ? "text-primary-foreground/80" : "text-foreground/70"}`}
                >
                  {isOwnMessage(msg) ? "我" : msg.sender.nickname?.trim() || "未命名用户"}
                </Link>
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] mt-0.5 ${isOwnMessage(msg) ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Input bar */}
      {isMember && room?.status === "APPROVED" && (
        <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-border/40 px-3 py-2 bg-background">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入消息..." maxLength={5000}
            className="flex-1 h-9" autoComplete="off" />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}

      {/* Management Dialog */}
      <Dialog open={showManage} onOpenChange={setShowManage}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>管理群聊</DialogTitle><DialogDescription>{room?.name}</DialogDescription></DialogHeader>
          <div className="flex gap-1 border-b mb-2">
            {(["members", "requests", "settings"] as const).map((tab) => (
              <button key={tab} onClick={() => setManageTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${manageTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                {tab === "members" ? "成员" : tab === "requests" ? `申请(${joinRequests.length})` : "设置"}
              </button>
            ))}
          </div>
          {manageError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {manageError}
            </p>
          )}
          {manageTab === "members" && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {room?.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{m.nickname ?? "未知"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{m.role}</span>
                  </div>
                  {m.id !== userId && m.role !== "OWNER" && ownerOrAdmin && (isOwner || m.role === "MEMBER") && (
                    <Button variant="ghost" size="icon" title="踢出（24 小时内不可重新加入）" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={async () => {
                      if (!confirm("确定要移除此成员吗？")) return;
                      setManageError("");
                      try {
                        const res = await fetch(`/api/chat/rooms/${roomId}/members/${m.id}`, { method: "DELETE" });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setManageError(data.error || "移除成员失败，请重试");
                          return;
                        }
                        await fetchRoom();
                      } catch {
                        setManageError("网络错误，未能移除成员");
                      }
                    }}><UserX className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {manageTab === "requests" && (
            manageLoading ? <p className="py-4 text-center text-sm text-muted-foreground">加载中...</p> :
            joinRequests.filter((r: any) => r.status === "PENDING").length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">暂无待处理的加入申请</p> :
            <div className="max-h-60 overflow-y-auto space-y-2">
              {joinRequests.filter((r: any) => r.status === "PENDING").map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded px-2 py-1 bg-muted/50">
                  <span className="text-sm">{r.user?.nickname ?? "未知"}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                      await fetch(`/api/chat/rooms/${roomId}/join-requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "APPROVE" }) });
                      fetchJoinRequests(); fetchRoom();
                    }}>通过</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={async () => {
                      await fetch(`/api/chat/rooms/${roomId}/join-requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REJECT" }) });
                      fetchJoinRequests();
                    }}>拒绝</Button>
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
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setShowManage(false)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
