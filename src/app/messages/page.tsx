"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  MessageSquare,
  Heart,
  Users,
  Shield,
  Settings,
  CheckCheck,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

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
      // silently ignore
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
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-md px-4 pb-24 pt-4 lg:ml-60")}>
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
        {loading ? (
          <ListSkeleton count={5} />
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="all" className="flex-1">
                全部
              </TabsTrigger>
              <TabsTrigger value="interactive" className="flex-1">
                互动通知
              </TabsTrigger>
              <TabsTrigger value="system" className="flex-1">
                系统通知
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

            <TabsContent value="system">
              <NotificationList
                notifications={system}
                onMarkRead={handleMarkRead}
                onNavigate={handleNavigate}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
