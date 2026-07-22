"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatApiError } from "@/lib/api-error";

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  answer: number;
  active: boolean;
}

export default function AdminQuizPage() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ text: "", opt1: "", opt2: "", opt3: "", opt4: "", answer: 0 });
  const [error, setError] = useState("");

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/quiz");
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions);
      }
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  function resetForm() {
    setForm({ text: "", opt1: "", opt2: "", opt3: "", opt4: "", answer: 0 });
    setEditingId(null);
  }

  function editQuestion(q: QuizQuestion) {
    setForm({
      text: q.text,
      opt1: q.options[0] || "",
      opt2: q.options[1] || "",
      opt3: q.options[2] || "",
      opt4: q.options[3] || "",
      answer: q.answer,
    });
    setEditingId(q.id);
  }

  async function handleSave() {
    const options = [form.opt1, form.opt2, form.opt3, form.opt4];
    const body = { text: form.text, options, answer: form.answer };

    if (form.text.trim().length < 5 || options.some((option) => !option.trim())) {
      setError("题目至少需要 5 个字符，且四个选项均不能为空");
      return;
    }

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/admin/quiz/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/admin/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        setError(formatApiError(await res.json().catch(() => ({})), "保存失败"));
        return;
      }
      setError("");
      resetForm();
      await fetchQuestions();
    } catch {
      setError("网络错误，请检查连接后重试");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此题？")) return;
    try {
      const res = await fetch(`/api/admin/quiz/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(formatApiError(await res.json().catch(() => ({})), "删除失败"));
        return;
      }
      await fetchQuestions();
    } catch { setError("网络错误，请检查连接后重试"); }
  }

  async function handleToggle(q: QuizQuestion) {
    const res = await fetch(`/api/admin/quiz/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !q.active }),
    });
    if (!res.ok) {
      setError(formatApiError(await res.json().catch(() => ({})), "状态更新失败"));
      return;
    }
    await fetchQuestions();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">平台新手指引题库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用于新注册用户的新手指引测验；没有启用题目时，系统会使用内置兜底题目。
        </p>
      </div>

      {/* Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "编辑题目" : "新增题目"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Input placeholder="题目文本" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          <fieldset className="space-y-3"><legend className="sr-only">题目选项与正确答案</legend>{[0,1,2,3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-mono w-6">{String.fromCharCode(65 + i)}.</span>
              <Input placeholder={`选项 ${String.fromCharCode(65 + i)}`} value={[form.opt1, form.opt2, form.opt3, form.opt4][i]}
                onChange={(e) => {
                  const arr: any = { ...form, [`opt${i+1}`]: e.target.value };
                  setForm(arr);
                }} />
              <input type="radio" name="answer" aria-label={`将选项 ${String.fromCharCode(65 + i)} 设为正确答案`} checked={form.answer === i} onChange={() => setForm({ ...form, answer: i })} className="mt-1" />
            </div>
          ))}</fieldset>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!form.text.trim()}>
              {editingId ? "更新" : "添加"}
            </Button>
            {editingId && <Button variant="ghost" onClick={resetForm}>取消</Button>}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : questions.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">暂无题目，请添加</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <Card key={q.id} className={q.active ? "" : "opacity-50"}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.text}</p>
                  <div className="mt-1 text-xs text-muted-foreground space-x-2">
                    {q.options.map((o, i) => (
                      <span key={i} className={i === q.answer ? "text-green-600 font-semibold" : ""}>
                        {String.fromCharCode(65 + i)}. {o}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => editQuestion(q)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleToggle(q)} title={q.active ? "禁用" : "启用"}>
                    {q.active ? "禁用" : "启用"}
                  </Button>
                  <Button size="icon" variant="ghost" className="text-red-600" onClick={() => handleDelete(q.id)}>
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
