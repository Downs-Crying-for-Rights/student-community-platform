"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";

// ---------- Types ----------

export interface CommentAuthor {
  id: string;
  nickname: string | null;
  avatar: string | null;
}

export interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  isAnonymous?: boolean;
  anonymousId?: string | null;
  author: CommentAuthor;
  replies?: CommentData[];
}

export interface CommentDrawerProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------- Helpers ----------

/** Return display name for a comment author */
export function getDisplayName(comment: CommentData): string {
  if (comment.isAnonymous) {
    return comment.anonymousId ?? "匿名用户";
  }
  return comment.author.nickname ?? "未命名用户";
}

/** Flatten nested comments into a 2-level structure for rendering */
export function flattenComments(comments: CommentData[]): CommentData[] {
  return comments.map((c) => ({
    ...c,
    replies: (c.replies ?? []).flatMap((r) => [
      r,
      ...(r.replies ?? []).map((rr) => ({ ...rr, replies: [] })),
    ]),
  }));
}

// ---------- Sub-components ----------

function CommentAvatar({ comment }: { comment: CommentData }) {
  const name = getDisplayName(comment);
  if (comment.isAnonymous || !comment.author.avatar) {
    return (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"
        aria-hidden="true"
      >
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={comment.author.avatar}
      alt={`${name} 头像`}
      className="h-8 w-8 shrink-0 rounded-full object-cover"
    />
  );
}

function CommentItem({
  comment,
  onReply,
  isReply = false,
}: {
  comment: CommentData;
  onReply: (comment: CommentData) => void;
  isReply?: boolean;
}) {
  const name = getDisplayName(comment);

  return (
    <div className={cn("flex gap-2", isReply && "ml-10")}>
      <CommentAvatar comment={comment} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDate(comment.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-foreground/90">{comment.content}</p>
        <button
          type="button"
          onClick={() => onReply(comment)}
          className="mt-1 text-xs text-muted-foreground hover:text-primary"
          aria-label={`回复 ${name}`}
        >
          回复
        </button>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export function CommentDrawer({ postId, open, onOpenChange }: CommentDrawerProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [replyTo, setReplyTo] = useState<CommentData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (open) {
      fetchComments();
    }
  }, [open, fetchComments]);

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const body: { content: string; parentId?: string } = { content };
      if (replyTo) {
        body.parentId = replyTo.id;
      }

      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setInputValue("");
        setReplyTo(null);
        await fetchComments();
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  }, [inputValue, sending, replyTo, postId, fetchComments]);

  const handleReply = useCallback((comment: CommentData) => {
    setReplyTo(comment);
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const displayComments = flattenComments(comments);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[70vh] flex-col rounded-t-2xl p-0">
        {/* Header */}
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" />
            评论 {total > 0 && `(${total})`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            帖子评论列表
          </SheetDescription>
        </SheetHeader>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                暂无评论，来发表第一条评论吧
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayComments.map((comment) => (
                <div key={comment.id}>
                  <CommentItem comment={comment} onReply={handleReply} />
                  {/* Nested replies (2nd level) */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {comment.replies.map((reply) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          onReply={handleReply}
                          isReply
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t px-4 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>回复 @{getDisplayName(replyTo)}</span>
              <button
                type="button"
                onClick={cancelReply}
                className="text-xs hover:text-foreground"
                aria-label="取消回复"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={replyTo ? `回复 @${getDisplayName(replyTo)}` : "写评论..."}
              disabled={sending}
              className="flex-1"
              aria-label="评论输入框"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              aria-label="发送评论"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
