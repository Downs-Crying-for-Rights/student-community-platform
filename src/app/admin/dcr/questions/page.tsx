"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DcrQuestion {
  id: string;
  text: string;
  options: string[];
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  answer: number[];
  score: number;
  explanation: string | null;
  active: boolean;
  createdAt: string;
}

const emptyForm = {
  text: "",
  type: "SINGLE_CHOICE" as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
  options: ["", ""],
  answer: [] as number[],
  score: 1,
  explanation: "",
};

const textareaClassName =
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function AdminDcrQuestionsPage() {
  const [questions, setQuestions] = useState<DcrQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dcr/questions");
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions);
      }
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  function openCreateDialog() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setDialogOpen(true);
  }

  function openEditDialog(q: DcrQuestion) {
    setEditingId(q.id);
    setForm({
      text: q.text,
      type: q.type,
      options: [...q.options],
      answer: [...q.answer],
      score: q.score,
      explanation: q.explanation || "",
    });
    setError("");
    setDialogOpen(true);
  }

  function addOption() {
    if (form.options.length >= 6) return;
    setForm({ ...form, options: [...form.options, ""] });
  }

  function removeOption(index: number) {
    if (form.options.length <= 2) return;
    const newOptions = form.options.filter((_, i) => i !== index);
    // Remove answer references to the removed option and shift indices
    const newAnswer = form.answer
      .filter((a) => a !== index)
      .map((a) => (a > index ? a - 1 : a));
    setForm({ ...form, options: newOptions, answer: newAnswer });
  }

  function updateOption(index: number, value: string) {
    const newOptions = [...form.options];
    newOptions[index] = value;
    setForm({ ...form, options: newOptions });
  }

  function toggleAnswer(index: number) {
    if (form.type === "SINGLE_CHOICE") {
      setForm({ ...form, answer: [index] });
    } else {
      const exists = form.answer.includes(index);
      setForm({
        ...form,
        answer: exists
          ? form.answer.filter((a) => a !== index)
          : [...form.answer, index].sort((a, b) => a - b),
      });
    }
  }

  async function handleSubmit() {
    if (!form.text.trim() || form.options.some((o) => !o.trim()) || form.answer.length === 0) {
      setError("请填写完整的题目信息");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body = {
        text: form.text.trim(),
        options: form.options.map((o) => o.trim()),
        type: form.type,
        answer: form.answer,
        score: form.score,
        explanation: form.explanation.trim() || undefined,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/admin/dcr/questions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/admin/dcr/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "操作失败");
        return;
      }

      setDialogOpen(false);
      fetchQuestions();
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此题目？此操作不可撤销。")) return;
    try {
      await fetch(`/api/admin/dcr/questions/${id}`, { method: "DELETE" });
      fetchQuestions();
    } catch {
      /* */
    }
  }

  async function handleToggle(q: DcrQuestion) {
    try {
      await fetch(`/api/admin/dcr/questions/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !q.active }),
      });
      fetchQuestions();
    } catch {
      /* */
    }
  }

  function typeLabel(type: string) {
    return type === "SINGLE_CHOICE" ? "单选" : "多选";
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">DCR 专区题库管理</h1>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          新增题目
        </Button>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            暂无题目，点击「新增题目」添加
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <Card key={q.id} className={q.active ? "" : "opacity-50"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{idx + 1}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          q.type === "SINGLE_CHOICE"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {typeLabel(q.type)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        分值: {q.score}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          q.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {q.active ? "启用" : "禁用"}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{q.text}</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {q.options.map((opt, i) => (
                        <span
                          key={i}
                          className={
                            q.answer.includes(i)
                              ? "text-green-600 font-semibold"
                              : ""
                          }
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                          {i < q.options.length - 1 ? " | " : ""}
                        </span>
                      ))}
                    </div>
                    {q.explanation && (
                      <p className="text-xs text-muted-foreground italic">
                        解析: {q.explanation}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(q)}
                      title="编辑"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggle(q)}
                      title={q.active ? "禁用" : "启用"}
                    >
                      {q.active ? "禁用" : "启用"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(q.id)}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑题目" : "新增题目"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="p-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded">
                {error}
              </div>
            )}

            {/* Question Text */}
            <div className="space-y-1.5">
              <Label htmlFor="q-text">题目文本 *</Label>
              <textarea
                id="q-text"
                className={textareaClassName}
                rows={3}
                maxLength={500}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="请输入题目内容"
              />
            </div>

            {/* Question Type */}
            <div className="space-y-1.5">
              <Label>题目类型</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    type: v as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
                    answer: [],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE_CHOICE">单选题</SelectItem>
                  <SelectItem value="MULTIPLE_CHOICE">多选题</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options */}
            <div className="space-y-1.5">
              <Label>选项列表 *（{form.options.length}/6）</Label>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm font-mono w-6 shrink-0">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                      maxLength={200}
                    />
                    {form.type === "SINGLE_CHOICE" ? (
                      <input
                        type="radio"
                        name="dcr-answer"
                        checked={form.answer.includes(i)}
                        onChange={() => toggleAnswer(i)}
                        className="mt-1 shrink-0"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={form.answer.includes(i)}
                        onChange={() => toggleAnswer(i)}
                        className="mt-1 shrink-0"
                      />
                    )}
                    {form.options.length > 2 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-red-500 shrink-0 h-8 w-8"
                        onClick={() => removeOption(i)}
                        title="删除选项"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {form.options.length < 6 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  className="mt-1"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  添加选项
                </Button>
              )}
            </div>

            {/* Score */}
            <div className="space-y-1.5">
              <Label htmlFor="q-score">分值（1-10）</Label>
              <Input
                id="q-score"
                type="number"
                min={1}
                max={10}
                value={form.score}
                onChange={(e) =>
                  setForm({
                    ...form,
                    score: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
              />
            </div>

            {/* Explanation */}
            <div className="space-y-1.5">
              <Label htmlFor="q-explanation">答案解析（可选）</Label>
              <textarea
                id="q-explanation"
                className={textareaClassName}
                rows={2}
                maxLength={500}
                value={form.explanation}
                onChange={(e) =>
                  setForm({ ...form, explanation: e.target.value })
                }
                placeholder="输入答案解析"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中..." : editingId ? "保存修改" : "确认创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
