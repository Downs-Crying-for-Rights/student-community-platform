"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface TutorialChapter {
  id: string;
  title: string;
  content: string;
  order: number;
  active: boolean;
}

export default function AdminTutorialPage() {
  const [chapters, setChapters] = useState<TutorialChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TutorialChapter | null>(null);
  const [form, setForm] = useState({ title: "", content: "", order: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dcr/tutorial");
      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  function openAdd() {
    const maxOrder =
      chapters.length > 0 ? Math.max(...chapters.map((c) => c.order)) : -1;
    setForm({ title: "", content: "", order: maxOrder + 1 });
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(ch: TutorialChapter) {
    setForm({ title: ch.title, content: ch.content, order: ch.order });
    setEditing(ch);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/admin/dcr/tutorial/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        : await fetch("/api/admin/dcr/tutorial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "保存失败");
      setError("");
      setDialogOpen(false);
      fetchChapters();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此章节？")) return;
    const res = await fetch(`/api/admin/dcr/tutorial/${id}`, { method: "DELETE" });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "删除失败");
    fetchChapters();
  }

  async function handleToggle(ch: TutorialChapter) {
    const res = await fetch(`/api/admin/dcr/tutorial/${ch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ch.active }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "状态更新失败");
    fetchChapters();
  }

  async function handleMove(fromIndex: number, direction: "up" | "down") {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= chapters.length) return;
    const a = chapters[fromIndex];
    const b = chapters[toIndex];
    const res = await fetch("/api/admin/dcr/tutorial", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstId: a.id, secondId: b.id }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "排序失败");
    fetchChapters();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">DCR 专区教程管理</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          新增章节
        </Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑章节" : "新增章节"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改章节信息" : "填写章节信息创建新章节"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                placeholder="章节标题（1-100字）"
                value={form.title}
                maxLength={100}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">内容</Label>
              <textarea
                id="content"
                className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="章节内容（1-10000字）"
                value={form.content}
                maxLength={10000}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">排序号</Label>
              <Input
                id="order"
                type="number"
                min={0}
                value={form.order}
                onChange={(e) =>
                  setForm({ ...form, order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || !form.content.trim() || saving}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? "更新" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : chapters.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          暂无章节，请点击「新增章节」添加
        </p>
      ) : (
        <div className="space-y-2">
          {chapters.map((ch, i) => (
            <Card key={ch.id} className={ch.active ? "" : "opacity-50"}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      #{ch.order}
                    </span>
                    <p className="text-sm font-medium">{ch.title}</p>
                    {!ch.active && (
                      <span className="rounded border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        已禁用
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {ch.content}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="上移"
                    disabled={i === 0}
                    onClick={() => handleMove(i, "up")}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="下移"
                    disabled={i === chapters.length - 1}
                    onClick={() => handleMove(i, "down")}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(ch)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggle(ch)}
                    title={ch.active ? "禁用" : "启用"}
                  >
                    {ch.active ? "禁用" : "启用"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => handleDelete(ch.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
