"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Send, LogIn, Users, Hash, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
}

interface RoomInfo {
  id: string;
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE";
  createdBy: { id: string; nickname: string; avatar: string | null };
  members: Array<{ id: string; nickname: string; avatar: string | null; role: string }>;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`);
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        return;
      }
      const data = await res.json();
      setRoom(data.room);
      setIsMember(data.room.members.some((m: { id: string }) => m.id === userId));
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

  useEffect(() => {
    fetchRoom();
    fetchMessages();
  }, [fetchRoom, fetchMessages]);

  // Poll for new messages
  useEffect(() => {
    intervalRef.current = setInterval(fetchMessages, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMessages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (res.ok) {
        setInput("");
        fetchMessages();
      } else {
        const data = await res.json();
        alert(data.error || "发送失败");
      }
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  }

  async function handleJoin() {
    setJoining(true);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`, { method: "POST" });
      if (res.ok) {
        setIsMember(true);
        fetchRoom();
        fetchMessages();
      } else {
        const data = await res.json();
        alert(data.error || "加入失败");
      }
    } catch { /* ignore */ } finally {
      setJoining(false);
    }
  }

  function isOwnMessage(msg: Message) {
    return msg.senderId === userId;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/chat")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {room?.type === "PRIVATE" ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <h1 className="text-sm font-semibold truncate">{room?.name ?? "加载中..."}</h1>
          </div>
          {room && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {room.memberCount} 名成员
            </p>
          )}
        </div>
        {!isMember && room?.type === "PUBLIC" && (
          <Button size="sm" onClick={handleJoin} disabled={joining}>
            <LogIn className="mr-1 h-4 w-4" />
            {joining ? "加入中..." : "加入"}
          </Button>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!isMember ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Lock className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {room?.type === "PRIVATE" ? "这是一个私密群聊" : "加入群聊以查看和发送消息"}
            </p>
            {room?.type === "PUBLIC" && (
              <Button onClick={handleJoin} disabled={joining}>
                <LogIn className="mr-1 h-4 w-4" />
                {joining ? "加入中..." : "加入群聊"}
              </Button>
            )}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">暂无消息，发送第一条消息吧</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${isOwnMessage(msg) ? "justify-end" : "justify-start"}`}
            >
              <Card
                className={`max-w-[75%] px-3 py-2 ${
                  isOwnMessage(msg)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] mt-0.5 ${isOwnMessage(msg) ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      {isMember && (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t px-4 py-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            maxLength={5000}
            className="flex-1"
            autoComplete="off"
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
