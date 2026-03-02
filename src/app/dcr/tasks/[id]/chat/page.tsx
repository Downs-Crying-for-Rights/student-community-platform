"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Send,
  Bookmark,
  Upload,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { cn } from "@/lib/utils";

/* ========== Types ========== */

export interface ChatMessage {
  id: string;
  content: string;
  fileUrl: string | null;
  quotedMessageId: string | null;
  isSystemMessage: boolean;
  isEvidence: boolean;
  createdAt: string;
  senderId: string;
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
}

/* ========== Helpers ========== */

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  UNDER_REVIEW: "审核中",
  OPEN: "待领取",
  CLAIMED: "已领取",
  IN_PROGRESS: "进行中",
  EVIDENCE_PENDING: "待结案",
  COMPLETED: "已完成",
  REJECTED: "已拒绝",
  CLOSED: "已关闭",
  DISPUTED: "争议中",
};

export function formatChatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/* ========== Component ========== */

export default function HelpChatPage() {
  const params = useParams();
  const taskId = params?.id as string;

  const [task, setTask] = useState<TaskSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  /* ---- Fetch session ---- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setUserId(session?.user?.id ?? "");
        }
      } catch {
        // ignore
      }
    };
    fetchSession();
  }, []);

  /* ---- Fetch task summary ---- */
  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        setTask({ id: data.id, title: data.title, status: data.status });
      }
    } catch {
      // non-critical, header just won't show
    }
  }, [taskId]);

  /* ---- Fetch messages ---- */
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}/chat?pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        setError(null);
      } else if (res.status === 403) {
        setError("无权访问此聊天");
      } else if (res.status === 404) {
        setError("聊天通道不存在");
      } else {
        setError("加载消息失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    fetchTask();
    fetchMessages();
  }, [taskId, fetchTask, fetchMessages]);

  /* ---- Polling ---- */
  useEffect(() => {
    const interval = setInterval(fetchMessages, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchMessages();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchMessages]);

  /* ---- Auto-scroll ---- */
  useEffect(() => {
    if (!loading && messages.length > 0) scrollToBottom();
  }, [loading, messages.length, scrollToBottom]);

  /* ---- Send message ---- */
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });

      if (res.ok) {
        setContent("");
        await fetchMessages();
        setTimeout(() => scrollToBottom(), 50);
      } else {
        const data = await res.json().catch(() => null);
        setSendError(data?.error ?? "发送失败，请稍后重试");
      }
    } catch {
      setSendError("网络错误，请检查连接后重试");
    } finally {
      setSending(false);
    }
  };

  /* ---- Mark as evidence ---- */
  const handleMarkEvidence = async (msgId: string) => {
    setMarkingId(msgId);
    try {
      const res = await fetch(
        `/api/dcr/tasks/${taskId}/chat/${msgId}/mark-evidence`,
        { method: "POST" },
      );
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, isEvidence: true } : m)),
        );
      } else {
        const data = await res.json().catch(() => null);
        setSendError(data?.error ?? "标记失败");
      }
    } catch {
      setSendError("操作失败，请稍后重试");
    } finally {
      setMarkingId(null);
    }
  };

  /* ---- Find quoted message content ---- */
  const getQuotedContent = (quotedId: string | null): string | null => {
    if (!quotedId) return null;
    const quoted = messages.find((m) => m.id === quotedId);
    return quoted?.content ?? null;
  };

  /* ========== Render ========== */

  /* Loading */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  /* Error (no messages loaded) */
  if (error && messages.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="rounded-2xl">
              <Link href={`/dcr/tasks/${taskId}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回任务详情
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* ===== Top bar: back + task summary ===== */}
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="sm" asChild className="rounded-2xl shrink-0">
            <Link href={`/dcr/tasks/${taskId}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回
            </Link>
          </Button>
          {task && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-medium">{task.title}</span>
              <span className="shrink-0 inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
            </div>
          )}
        </div>

        {/* ===== Privacy banner ===== */}
        <div className="mb-4">
          <PrivacyBanner
            message="请注意保护隐私，不要发送实名、手机号、精确学校地址等敏感信息"
            dismissible
          />
        </div>

        {/* ===== Quick action buttons ===== */}
        <div className="mb-4 flex gap-2">
          <Button variant="outline" size="sm" className="rounded-2xl" asChild>
            <Link href={`/dcr/tasks/${taskId}/evidence`}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              上传到证据区
            </Link>
          </Button>
        </div>

        {/* ===== Message list ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">私聊消息</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="max-h-[28rem] space-y-3 overflow-y-auto"
              role="log"
              aria-label="聊天消息列表"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  暂无消息
                </p>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId === userId;
                  const quotedContent = getQuotedContent(msg.quotedMessageId);

                  /* System message */
                  if (msg.isSystemMessage) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {msg.content}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={cn("flex", isOwn ? "justify-end" : "justify-start")}
                    >
                      <div className="max-w-[80%] space-y-1">
                        {/* Quoted message */}
                        {quotedContent && (
                          <div className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground border-l-2 border-muted-foreground/30">
                            {quotedContent.length > 80
                              ? quotedContent.slice(0, 80) + "…"
                              : quotedContent}
                          </div>
                        )}

                        {/* Message bubble */}
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2",
                            isOwn
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={cn(
                                "text-xs",
                                isOwn
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatChatTime(msg.createdAt)}
                            </span>
                            {msg.isEvidence && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                                <Bookmark className="h-3 w-3" aria-hidden="true" />
                                已标记
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mark as evidence button (non-system, not yet marked) */}
                        {!msg.isEvidence && (
                          <button
                            type="button"
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                            disabled={markingId === msg.id}
                            onClick={() => handleMarkEvidence(msg.id)}
                            aria-label={`标记消息为证据: ${msg.content.slice(0, 20)}`}
                          >
                            {markingId === msg.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Bookmark className="h-3 w-3" aria-hidden="true" />
                            )}
                            标记为证据
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ===== Send form ===== */}
            <form
              onSubmit={handleSend}
              className="mt-4 flex gap-2"
              aria-label="发送消息"
            >
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (sendError) setSendError(null);
                }}
                placeholder="输入消息..."
                maxLength={5000}
                rows={2}
                className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="消息内容"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
              />
              <Button
                type="submit"
                size="sm"
                disabled={sending || !content.trim()}
                aria-label="发送"
                className="self-end"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </form>

            {/* Send error */}
            {sendError && (
              <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {sendError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
