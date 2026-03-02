"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ArticleItem {
  id: string;
  title: string;
  category: string;
  visibility: "PUBLIC" | "DCR_ONLY";
  isPublished: boolean;
  updatedAt: string;
}

const CATEGORIES = ["RIGHTS", "POLICY", "GUIDE", "FAQ", "OTHER"] as const;
const VISIBILITY_OPTIONS = ["PUBLIC", "DCR_ONLY"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  RIGHTS: "权益",
  POLICY: "政策",
  GUIDE: "指南",
  FAQ: "常见问题",
  OTHER: "其他",
};

const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "公开",
  DCR_ONLY: "仅 DCR",
};

interface FormData {
  title: string;
  content: string;
  category: string;
  visibility: "PUBLIC" | "DCR_ONLY";
  isPublished: boolean;
}

const emptyForm: FormData = {
  title: "",
  content: "",
  category: "RIGHTS",
  visibility: "PUBLIC",
  isPublished: false,
};

export default function KBAdminPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kb?all=true");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取文章列表失败");
        return;
      }
      const data = await res.json();
      setArticles(data.articles);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: formData.content.trim(),
          category: formData.category,
          visibility: formData.visibility,
          isPublished: formData.isPublished,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "创建文章失败");
        return;
      }
      setShowCreate(false);
      setFormData({ ...emptyForm });
      fetchArticles();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = async (article: ArticleItem) => {
    setError("");
    try {
      const res = await fetch(`/api/kb/${article.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取文章详情失败");
        return;
      }
      const data = await res.json();
      const full = data.article;
      setEditingId(article.id);
      setShowCreate(false);
      setFormData({
        title: full.title,
        content: full.content,
        category: full.category,
        visibility: full.visibility,
        isPublished: full.isPublished,
      });
    } catch {
      setError("网络错误，请检查连接后重试");
    }
  };

  const handleEdit = async () => {
    if (!editingId || !formData.title.trim() || !formData.content.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/kb/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title.trim(),
          content: formData.content.trim(),
          category: formData.category,
          visibility: formData.visibility,
          isPublished: formData.isPublished,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "更新文章失败");
        return;
      }
      setEditingId(null);
      setFormData({ ...emptyForm });
      fetchArticles();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/kb/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "删除文章失败");
        return;
      }
      setDeleteConfirmId(null);
      fetchArticles();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setFormData({ ...emptyForm });
    setError("");
  };

  const isFormOpen = showCreate || editingId !== null;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">知识库管理</h1>
        {!isFormOpen && (
          <Button onClick={() => { setShowCreate(true); setFormData({ ...emptyForm }); setError(""); }}>
            新建文章
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Create / Edit Form */}
      {isFormOpen && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "编辑文章" : "新建文章"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="article-title" className="block text-sm mb-1">标题（必填）</label>
              <input
                id="article-title"
                type="text"
                maxLength={200}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="border rounded px-3 py-2 text-sm w-full"
                placeholder="输入文章标题"
              />
            </div>
            <div>
              <label htmlFor="article-content" className="block text-sm mb-1">内容（必填）</label>
              <textarea
                id="article-content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="border rounded px-3 py-2 text-sm w-full"
                rows={6}
                placeholder="输入文章内容"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <label htmlFor="article-category" className="block text-sm mb-1">分类</label>
                <select
                  id="article-category"
                  className="border rounded px-3 py-2 text-sm"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="article-visibility" className="block text-sm mb-1">可见性</label>
                <select
                  id="article-visibility"
                  className="border rounded px-3 py-2 text-sm"
                  value={formData.visibility}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as "PUBLIC" | "DCR_ONLY" })}
                >
                  {VISIBILITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPublished}
                    onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                    className="rounded"
                  />
                  发布
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={editingId ? handleEdit : handleCreate}
                disabled={submitting || !formData.title.trim() || !formData.content.trim()}
              >
                {submitting ? "提交中..." : editingId ? "保存修改" : "确认创建"}
              </Button>
              <Button variant="outline" onClick={cancelForm}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <Card className="mb-6 border-red-200">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-red-700">确定要删除这篇文章吗？此操作不可撤销。</span>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={submitting}
              >
                {submitting ? "删除中..." : "确认删除"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Article Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">标题</th>
                    <th className="text-left p-3">分类</th>
                    <th className="text-left p-3">可见性</th>
                    <th className="text-left p-3">发布状态</th>
                    <th className="text-left p-3">更新时间</th>
                    <th className="text-left p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => (
                    <tr key={article.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium max-w-[200px] truncate">{article.title}</td>
                      <td className="p-3 text-xs">
                        {CATEGORY_LABELS[article.category] || article.category}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          article.visibility === "PUBLIC"
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}>
                          {VISIBILITY_LABELS[article.visibility] || article.visibility}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          article.isPublished
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {article.isPublished ? "已发布" : "草稿"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => startEdit(article)}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setDeleteConfirmId(article.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {articles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        暂无文章
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
