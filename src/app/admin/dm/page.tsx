"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReviewThread {
  id: string;
  participant1: { nickname: string | null };
  participant2: { nickname: string | null };
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    sender: { id: string; nickname: string | null };
  }>;
  updatedAt: string;
}

export default function AdminDMPage() {
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [selected, setSelected] = useState<ReviewThread | null>(null);

  useEffect(() => {
    fetch("/api/admin/dm").then((res) => res.json()).then((data) => setThreads(data.threads ?? []));
  }, []);

  async function inspect(id: string) {
    const res = await fetch(`/api/admin/dm?threadId=${id}`);
    const data = await res.json();
    setSelected(data.threads?.[0] ?? null);
  }

  return (
    <main className="mx-auto max-w-screen-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">私信审查</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          {threads.map((thread) => (
            <button key={thread.id} onClick={() => inspect(thread.id)} className="w-full text-left">
              <Card><CardContent className="p-4"><p className="font-medium">{thread.participant1.nickname || "用户"} ↔ {thread.participant2.nickname || "用户"}</p><p className="truncate text-sm text-muted-foreground">{thread.messages[0]?.content || "暂无消息"}</p></CardContent></Card>
            </button>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle>审查内容</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selected ? selected.messages.slice().reverse().map((message) => (
              <div key={message.id} className="rounded-lg bg-muted p-3 text-sm">
                <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{message.sender.nickname || message.sender.id}</span>
                  <span>{new Date(message.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">选择会话查看内容</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
