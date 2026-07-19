"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Save, Eye, Edit3, Plus, Trash2 } from "lucide-react";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";

interface SiteKey {
  key: string;
  title: string;
  updatedAt: string;
}

export default function SiteContentPage() {
  const [keys, setKeys] = useState<SiteKey[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // New key dialog
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newTitle, setNewTitle] = useState("");

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false);

  // Load keys list
  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/admin/site-content");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.items ?? []);
        if (data.items?.length > 0 && !selectedKey) {
          setSelectedKey(data.items[0].key);
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchKeys(); }, []);

  // Load selected content
  useEffect(() => {
    if (!selectedKey) return;
    setLoading(true);
    fetch(`/api/admin/site-content/${selectedKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.content) {
          setTitle(d.content.title || "");
          setContent(d.content.content || "");
        } else {
          setTitle("");
          setContent("");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedKey]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/site-content/${selectedKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
        setMessage("保存成功");
        fetchKeys();
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("保存失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newKey.trim() || !newTitle.trim()) return;
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey.trim().toLowerCase(), title: newTitle.trim() }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewKey("");
        setNewTitle("");
        await fetchKeys();
        setSelectedKey(newKey.trim().toLowerCase());
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error ?? "创建失败");
      }
    } catch {
      setMessage("网络错误");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/admin/site-content/${selectedKey}`, { method: "DELETE" });
      if (res.ok) {
        setShowDelete(false);
        await fetchKeys();
        setSelectedKey("");
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">站点内容管理</h1>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建文档
        </Button>
      </div>

      {/* Key selector */}
      <div className="mb-4 flex flex-wrap gap-2">
        {keys.map(k => (
          <Button
            key={k.key}
            variant={selectedKey === k.key ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedKey(k.key)}
          >
            {k.title}
          </Button>
        ))}
        {keys.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无文档，点击右上角新建</p>
        )}
      </div>

      {/* Editor */}
      {selectedKey && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">编辑：{title || selectedKey}</CardTitle>
            {!(["dm_consent", "chat_monitoring_consent"].includes(selectedKey)) && (
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setShowDelete(true)}>
                <Trash2 className="mr-1 h-4 w-4" />
                删除
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : (
              <>
                <div>
                  <Label>标题</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="文档标题" className="mt-1" />
                  {(["dm_consent", "chat_monitoring_consent"].includes(selectedKey)) && (
                    <p className="mt-2 text-xs text-muted-foreground">保存后文案版本会更新，用户执行对应操作时必须确认最新版本。</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label>内容 (Markdown)</Label>
                  <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
                    {preview ? <Edit3 className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                    {preview ? "编辑" : "预览"}
                  </Button>
                </div>
                {preview ? (
                   <SafeMarkdown content={content} className="min-h-[200px] rounded border bg-muted/20 p-4" />
                ) : (
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="w-full min-h-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="在此编写 Markdown 内容..."
                  />
                )}
                <div className="flex items-center gap-3">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-1 h-4 w-4" />
                    {saving ? "保存中..." : "保存"}
                  </Button>
                  {message && <span className={`text-sm ${message.includes("成功") ? "text-green-600" : "text-red-600"}`}>{message}</span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* New key dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建站点文档</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Key（唯一标识，如 privacy_policy）</Label>
              <Input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="user_agreement" className="mt-1" />
            </div>
            <div>
              <Label>标题（显示名称）</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="用户注册协议" className="mt-1" />
            </div>
            <Button onClick={handleCreate} disabled={!newKey.trim() || !newTitle.trim()}>
              <Plus className="mr-1 h-4 w-4" />
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">确定要删除文档「{title || selectedKey}」吗？此操作不可撤销。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDelete(false)}>取消</Button>
            <Button variant="default" className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>确认删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
