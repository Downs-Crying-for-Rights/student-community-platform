"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Users, Lock, Hash, Shield, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

interface ChatRoom {
  id: string;
  name: string;
  description: string;
  type: "PUBLIC" | "PRIVATE";
  createdBy: { id: string; nickname: string; avatar: string | null };
  memberCount: number;
  lastMessage: { content: string; createdAt: string } | null;
  updatedAt: string;
}

export default function ChatListPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [newJoinMode, setNewJoinMode] = useState<"DIRECT" | "APPROVAL">("DIRECT");
  const [creating, setCreating] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/rooms");
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        return;
      }
      const data = await res.json();
      setRooms(data.rooms);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), type: newType, joinMode: newJoinMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setNewName(""); setNewDesc("");
        router.push(`/chat/${data.room.id}`);
      }
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className="mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            群聊大厅
          </h1>
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
          <p className="py-12 text-center text-sm text-muted-foreground">暂无群聊，创建一个吧</p>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <Card
                key={room.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/chat/${room.id}`)}
              >
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
                  {room.type === "PRIVATE" && (
                    <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  {room.joinMode === "APPROVAL" && (
                    <Shield className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                    </div>
                    {room.lastMessage ? (
                      <p className="text-xs text-muted-foreground truncate">
                        {room.lastMessage.content.slice(0, 60)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">暂无消息</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {room.memberCount}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建群聊</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-sm font-medium">群聊名称</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入群聊名称"
                  maxLength={50}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">简介（可选）</label>
                <Input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="群聊介绍"
                  maxLength={200}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">类型</label>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant={newType === "PUBLIC" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewType("PUBLIC")}
                  >
                    <Hash className="mr-1 h-4 w-4" />公开
                  </Button>
                  <Button
                    type="button"
                    variant={newType === "PRIVATE" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewType("PRIVATE")}
                  >
                    <Lock className="mr-1 h-4 w-4" />私密
                  </Button>
                </div>
              </div>
              {newType === "PUBLIC" && (
                <div>
                  <label className="text-sm font-medium">加入方式</label>
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={newJoinMode === "DIRECT" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNewJoinMode("DIRECT")}
                    >
                      <LogIn className="mr-1 h-4 w-4" />自由加入
                    </Button>
                    <Button
                      type="button"
                      variant={newJoinMode === "APPROVAL" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNewJoinMode("APPROVAL")}
                    >
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
      </main>
      <BottomNav />
    </div>
  );
}
