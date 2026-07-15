"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Save, Eye, Edit3 } from "lucide-react";

const AVAILABLE_KEYS = [
  { key: "user_agreement", label: "用户注册协议" },
];

export default function SiteContentPage() {
  const [selectedKey, setSelectedKey] = useState("user_agreement");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/site-content/${selectedKey}`)
      .then(r => r.json())
      .then(d => {
        if (d.content) {
          setTitle(d.content.title || "");
          setContent(d.content.content || "");
        } else {
          setTitle("用户注册协议");
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">站点内容管理</h1>
      <div className="mb-4 flex gap-2">
        {AVAILABLE_KEYS.map(k => (
          <Button key={k.key} variant={selectedKey === k.key ? "default" : "outline"} size="sm" onClick={() => setSelectedKey(k.key)}>
            {k.label}
          </Button>
        ))}
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">编辑内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">加载中...</p> : (
            <>
              <div>
                <Label>标题</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="协议标题" className="mt-1" />
              </div>
              <div className="flex items-center justify-between">
                <Label>内容 (Markdown)</Label>
                <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
                  {preview ? <Edit3 className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                  {preview ? "编辑" : "预览"}
                </Button>
              </div>
              {preview ? (
                <div className="prose prose-sm dark:prose-invert max-w-none min-h-[200px] rounded border p-4 bg-muted/20" dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, "<br>") }} />
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
    </div>
  );
}
