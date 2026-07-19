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
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dm/thread/${threadId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMessages(data.messages ?? []);
    else setError(data.error || "私信加载失败");
    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    fetch("/api/auth/session").then((res) => res.json()).then((data) => setUserId(data?.user?.id ?? ""));
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/dm/thread/${threadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setContent("");
      await load();
    } else setError(data.error || "发送失败");
    setSending(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-md flex-col px-4 pb-40 pt-4 lg:pb-24">
      <div className="mb-4 flex items-center gap-3 border-b pb-3">
        <Button variant="ghost" size="sm" asChild><Link href="/messages?tab=dm"><ArrowLeft className="h-4 w-4" />返回私信</Link></Button>
        <h1 className="font-semibold">一对一私信</h1>
      </div>
      {error && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <div className="flex-1 space-y-3 overflow-y-auto pb-24">
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
      <form onSubmit={send} className="fixed bottom-20 left-0 right-0 z-30 mx-auto flex w-full max-w-screen-md gap-2 border-t bg-background p-4 lg:bottom-0 lg:left-60">
        <Input value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} placeholder="输入私信内容" />
        <Button type="submit" disabled={sending || !content.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </form>
    </main>
  );
}

export default function DMThreadPage() {
  return <DMConsentGate><DMThreadContent /></DMConsentGate>;
}
