"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canSendMessage,
  formatMessageTime,
  isOwnMessage,
  type CaseStatus,
} from "@/lib/dcr-ui-helpers";
import { cn } from "@/lib/utils";

/* ========== Types ========== */

export interface MessageItem {
  id: string;
  content: string;
  isAnonymous: boolean;
  senderId: string;
  createdAt: string;
}

export interface MessagePanelProps {
  caseId: string;
  currentUserId: string;
  caseStatus: CaseStatus;
  isSubmitter?: boolean;
}

/* ========== Component ========== */

export function MessagePanel({
  caseId,
  currentUserId,
  caseStatus,
  isSubmitter,
}: MessagePanelProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        setError(null);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "加载消息失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  /* ---- 15-second polling + visibility change auto-refresh ---- */
  useEffect(() => {
    const interval = setInterval(fetchMessages, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom();
    }
  }, [loading, messages.length, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setContent("");
        // Scroll after state update
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

  const showSendForm = canSendMessage(caseStatus, isSubmitter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">消息</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载消息中...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Messages list */}
        {!loading && !error && (
          <>
            <div
              className="max-h-80 space-y-3 overflow-y-auto"
              role="log"
              aria-label="消息列表"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  暂无消息
                </p>
              ) : (
                messages.map((msg) => {
                  const own = isOwnMessage(msg.senderId, currentUserId);
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        own ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2",
                          own
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            own
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatMessageTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Send form — only visible when status allows */}
            {showSendForm && (
              <form
                onSubmit={handleSend}
                className="mt-4 flex gap-2"
                aria-label="发送消息"
              >
                <input
                  type="text"
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (sendError) setSendError(null);
                  }}
                  placeholder="输入消息..."
                  maxLength={2000}
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="消息内容"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={sending || !content.trim()}
                  aria-label="发送"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </form>
            )}

            {/* Send error — near the send button */}
            {sendError && (
              <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {sendError}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
