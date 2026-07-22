"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReportDialog } from "@/components/shared/ReportDialog";
import { DMConsentGate } from "@/components/dm/DMConsentDialog";

interface DMMessage {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
}

function DMThreadContent() {
  const threadId = useParams()?.threadId as string;
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [userId, setUserId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [isSystemReadOnly, setIsSystemReadOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const generationRef = useRef(0);
  const controllersRef = useRef(new Set<AbortController>());

  const load = useCallback(async (mode: "initial" | "poll" | "older", cursor?: string, generation = generationRef.current) => {
    if (mode !== "older" && loadInFlightRef.current) return;
    if (mode !== "older") loadInFlightRef.current = true;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const container = scrollRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    try {
      const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await fetch(`/api/dm/thread/${threadId}${params}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (generation !== generationRef.current) return;
      if (res.ok) {
        const incoming: DMMessage[] = data.messages ?? [];
        setMessages((previous) => {
          const byId = new Map((cursor ? [...incoming, ...previous] : [...previous, ...incoming]).map((message) => [message.id, message]));
          return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
        if (mode !== "poll") {
          setNextCursor(data.nextCursor ?? null);
          setHasMore(Boolean(data.hasMore));
        }
        setIsSystemReadOnly(Boolean(data.isSystemReadOnly));
        setError("");
        if (mode === "older") {
          requestAnimationFrame(() => {
            if (container) container.scrollTop += container.scrollHeight - previousHeight;
          });
        }
      } else {
        setError(data.error || "私信加载失败");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (generation !== generationRef.current) return;
      setError("网络错误，请检查连接后重试");
    } finally {
      controllersRef.current.delete(controller);
      if (generation === generationRef.current) {
        setLoading(false);
        setLoadingOlder(false);
        if (mode !== "older") loadInFlightRef.current = false;
      }
    }
  }, [threadId]);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controllers = controllersRef.current;
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    loadInFlightRef.current = false;
    initialScrollRef.current = false;
    setMessages([]);
    setNextCursor(null);
    setHasMore(false);
    setError("");
    setLoading(true);
    fetch("/api/auth/session").then((res) => res.json()).then((data) => setUserId(data?.user?.id ?? ""));
    void load("initial", undefined, generation);
    const timer = setInterval(() => void load("poll", undefined, generation), 10000);
    return () => {
      clearInterval(timer);
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, [load]);

  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollRef.current) {
      initialScrollRef.current = true;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, messages.length]);

  function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    void load("older", nextCursor);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/dm/thread/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setContent("");
        await load("poll");
      } else {
        setError(data.error || "发送失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-md flex-col px-4 pb-40 pt-4 lg:pb-24">
      <div className="mb-4 flex items-center gap-3 border-b pb-3">
        <Button variant="ghost" size="sm" asChild><Link href="/messages?tab=dm"><ArrowLeft className="h-4 w-4" />返回私信</Link></Button>
        <h1 className="font-semibold">一对一私信</h1>
      </div>
      {error && <div className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void load(nextCursor ? "older" : "poll", nextCursor ?? undefined)}>重试</Button></div>}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-24">
        {!loading && hasMore && <div className="flex justify-center"><Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />}加载更早消息</Button></div>}
        {loading ? <Loader2 className="mx-auto mt-12 h-6 w-6 animate-spin" /> : messages.map((message) => (
          <div key={message.id} className={cn("flex items-end gap-1", message.senderId === userId ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm", message.senderId === userId ? "bg-primary text-primary-foreground" : "bg-muted")}>{message.content}</div>
            {message.senderId !== userId && (
              <ReportDialog target={{ targetDmMessageId: message.id }} label="举报此私信" compact />
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {isSystemReadOnly ? <div className="fixed bottom-20 left-0 right-0 z-30 mx-auto w-full max-w-screen-md border-t bg-background p-4 text-center text-sm text-muted-foreground lg:bottom-0 lg:left-60">平台公告私信仅供阅读，不支持回复</div> : <form onSubmit={send} className="fixed bottom-20 left-0 right-0 z-30 mx-auto flex w-full max-w-screen-md gap-2 border-t bg-background p-4 lg:bottom-0 lg:left-60">
        <Input value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} placeholder="输入私信内容" />
        <Button type="submit" disabled={sending || !content.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </form>}
    </main>
  );
}

export default function DMThreadPage() {
  return <DMConsentGate><DMThreadContent /></DMConsentGate>;
}
