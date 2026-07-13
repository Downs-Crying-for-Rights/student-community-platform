"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  MessageSquare,
  Heart,
  Users,
  Shield,
  Settings,
  CheckCheck,
  Hash,
  Lock,
  Plus,
  MessageCircle,
  LogIn,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

interface ChatRoom {
  id: string;
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE";
  joinMode: string;
  createdBy: { id: string; nickname: string; avatar: string | null };
  memberCount: number;
  lastMessage: { id: string; content: string; createdAt: string } | null;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

/* ---------- Helpers (exported for testing) ---------- */

const INTERACTIVE_TYPES = new Set(["COMMENT", "LIKE", "PSYCH_MATCH"]);
const SYSTEM_TYPES = new Set(["REPORT_RESULT", "CASE_UPDATE", "DCR_ACCESS", "SYSTEM"]);

export function classifyNotification(type: string): "interactive" | "system" {
  if (INTERACTIVE_TYPES.has(type)) return "interactive";
  return "system";
}

export function groupNotifications(notifications: Notification[]) {
  const interactive: Notification[] = [];
  const system: Notification[] = [];
  for (const n of notifications) {
    if (classifyNotification(n.type) === "interactive") {
      interactive.push(n);
    } else {
      system.push(n);
    }
  }
  return { interactive, system };
}

export function getNotificationIcon(type: string) {
  switch (type) {
    case "COMMENT":
      return MessageSquare;
    case "LIKE":
      return Heart;
    case "PSYCH_MATCH":
      return Users;
    case "REPORT_RESULT":
      return Shield;
    case "CASE_UPDATE":
    case "DCR_ACCESS":
      return Settings;
    case "SYSTEM":
    default:
      return Bell;
  }
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN");
}

/* ---------- Notification Item ---------- */

function getLastRead(roomId: string): string | null {
  if (typeof window === "undefined") return null;
  try { return (JSON.parse(localStorage.getItem("chat_last_read") || "{}") as Record<string, string>)[roomId] ?? null; } catch { return null; }
}

function getChatUnreadCount(room: ChatRoom): number {
  if (!room.lastMessage) return 0;
  const lastReadId = getLastRead(room.id);
  if (!lastReadId) return 1;
  return room.lastMessage.id !== lastReadId ? 1 : 0;
}

function ChatRoomList() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [newJoinMode, setNewJoinMode] = useState<"DIRECT" | "APPROVAL">("DIRECT");
  const [creating, setCreating] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/rooms");
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms ?? []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc, type: newType, joinMode: newType === "PUBLIC" ? newJoinMode : "APPROVAL" }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(""); setNewDesc("");
        fetchRooms();
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />创建群聊
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-4 h-16" /></Card>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          title="暂无群聊"
          description="创建一个群聊开始交流吧"
          actionLabel="创建群聊"
          actionHref="#"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-2">
          {rooms.map((room) => (
            <Link key={room.id} href={`/chat/${room.id}`} className="block">
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    {room.type === "PRIVATE" ? (
                      <Lock className="h-5 w-5 text-primary" />
                    ) : (
                      <Hash className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{room.name}</span>
                      {room.type === "PRIVATE" && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                      {room.joinMode === "APPROVAL" && <Shield className="h-3 w-3 text-amber-500 shrink-0" />}
                    </div>
                    {room.lastMessage ? (
                      <p className="text-xs text-muted-foreground truncate">{room.lastMessage.content.slice(0, 60)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">暂无消息</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {(() => { const c = getChatUnreadCount(room); return c > 0 ? (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{c}</span>
                    ) : null; })()}
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {room.memberCount}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建群聊</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label htmlFor="chat-room-name" className="text-sm font-medium">群聊名称</label>
              <Input id="chat-room-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="输入群聊名称" maxLength={50} required className="mt-1" />
            </div>
            <div>
              <label htmlFor="chat-room-desc" className="text-sm font-medium">简介（可选）</label>
              <Input id="chat-room-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="群聊介绍" maxLength={200} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">类型</label>
              <div className="mt-1 flex gap-2">
                <Button type="button" variant={newType === "PUBLIC" ? "default" : "outline"} size="sm" onClick={() => setNewType("PUBLIC")}>
                  <Hash className="mr-1 h-4 w-4" />公开
                </Button>
                <Button type="button" variant={newType === "PRIVATE" ? "default" : "outline"} size="sm" onClick={() => setNewType("PRIVATE")}>
                  <Lock className="mr-1 h-4 w-4" />私密
                </Button>
              </div>
            </div>
            {newType === "PUBLIC" && (
              <div>
                <label className="text-sm font-medium">加入方式</label>
                <div className="mt-1 flex gap-2">
                  <Button type="button" variant={newJoinMode === "DIRECT" ? "default" : "outline"} size="sm" onClick={() => setNewJoinMode("DIRECT")}>
                    <LogIn className="mr-1 h-4 w-4" />自由加入
                  </Button>
                  <Button type="button" variant={newJoinMode === "APPROVAL" ? "default" : "outline"} size="sm" onClick={() => setNewJoinMode("APPROVAL")}>
                    <Shield className="mr-1 h-4 w-4" />审核加入
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: (link: string) => void;
}) {
  const Icon = getNotificationIcon(notification.type);

  function handleClick() {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    if (notification.link) {
      onNavigate(notification.link);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left"
      aria-label={`通知：${notification.title}`}
    >
      <Card
        className={cn(
          "transition-shadow hover:shadow-md",
          !notification.isRead && "border-primary/30 bg-primary/5"
        )}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              !notification.isRead
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  "truncate text-sm",
                  !notification.isRead ? "font-semibold text-foreground" : "text-foreground"
                )}
              >
                {notification.title}
              </p>
              {!notification.isRead && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {notification.content}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {formatTime(notification.createdAt)}
            </p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

/* ---------- Notification List ---------- */

function NotificationList({
  notifications,
  onMarkRead,
  onNavigate,
}: {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onNavigate: (link: string) => void;
}) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        title="暂无通知"
        description="当有新的互动或系统消息时，会在这里显示"
        actionLabel="去发现"
        actionHref="/discover"
      />
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <NotificationItem
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function MessagesPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?pageSize=50");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      setError("通知加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleMarkRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // silently ignore
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // silently ignore
    } finally {
      setMarkingAll(false);
    }
  }

  function handleNavigate(link: string) {
    router.push(link);
  }

  const { interactive, system } = groupNotifications(notifications);

  return (
    <div className="min-h-screen bg-background">
      <main className={cn("mx-auto max-w-screen-md px-4 pb-24 pt-4")}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Bell className="h-5 w-5" aria-hidden="true" />
            通知
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </h1>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="min-h-[44px] text-xs"
            >
              <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              全部已读
            </Button>
          )}
        </div>

        {/* Content */}
        {error ? (
          <div role="alert" aria-live="polite" className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : loading ? (
          <ListSkeleton count={5} />
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="all" className="flex-1">
                通知
              </TabsTrigger>
              <TabsTrigger value="interactive" className="flex-1">
                互动
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1">
                群聊
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <NotificationList
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onNavigate={handleNavigate}
              />
            </TabsContent>

            <TabsContent value="interactive">
              <NotificationList
                notifications={interactive}
                onMarkRead={handleMarkRead}
                onNavigate={handleNavigate}
              />
            </TabsContent>

            <TabsContent value="chat">
              <ChatRoomList />
            </TabsContent>
          </Tabs>
        )}
      </main>

    </div>
  );
}
