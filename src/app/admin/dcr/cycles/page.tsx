"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Shuffle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Candidate {
  id: string;
  nickname: string | null;
  role: string;
  needText: string | null;
  offerText: string | null;
  waitingSince: string | null;
}

interface Recommendation {
  id: string;
  score: number;
  reasons: string[];
  participants: [Candidate, Candidate, Candidate];
}

interface CycleItem {
  id: string;
  mode: string;
  status: string;
  createdAt: string;
  links: Array<{
    id: string;
    direction: string;
    status: string;
    fromUser: { id: string; nickname: string | null };
    toUser: { id: string; nickname: string | null };
  }>;
}

function userLabel(user: Candidate): string {
  return `${user.nickname?.trim() || "未命名用户"} · ${user.role}${user.waitingSince ? " · 已排队" : ""}`;
}

export default function AdminDcrCyclesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [cycles, setCycles] = useState<CycleItem[]>([]);
  const [selected, setSelected] = useState<[string, string, string]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/dcr/cycles", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "加载互助循环失败");
        return;
      }
      setCandidates(data.candidates ?? []);
      setRecommendations(data.recommendations ?? []);
      setCycles(data.cycles ?? []);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const uniqueSelection = useMemo(
    () => selected.every(Boolean) && new Set(selected).size === 3,
    [selected],
  );

  async function assign(body: Record<string, string>, loadingKey: string) {
    setActionLoading(loadingKey);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/dcr/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "分配失败");
        return;
      }
      setNotice(`互助循环已创建：${data.cycle.id}`);
      setSelected(["", "", ""]);
      await fetchData();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setActionLoading("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">互助循环管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            审阅系统推荐，手动指定 A/B/C，或按排队与需求互补度自动分配。
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />指定互助对象</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(["A（发起方）", "B", "C"] as const).map((label, index) => (
              <label key={label} className="block space-y-1.5 text-sm">
                <span className="font-medium">{label}</span>
                <select
                  value={selected[index]}
                  onChange={(event) => setSelected((current) => {
                    const next = [...current] as [string, string, string];
                    next[index] = event.target.value;
                    return next;
                  })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">请选择</option>
                  {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{userLabel(candidate)}</option>)}
                </select>
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                disabled={!uniqueSelection || Boolean(actionLoading)}
                onClick={() => assign({
                  action: "ASSIGN",
                  participantAId: selected[0],
                  participantBId: selected[1],
                  participantCId: selected[2],
                }, "manual")}
              >
                {actionLoading === "manual" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}创建指定循环
              </Button>
              <Button
                variant="secondary"
                disabled={candidates.length < 3 || Boolean(actionLoading)}
                onClick={() => assign({ action: "AUTO_ASSIGN" }, "auto")}
              >
                {actionLoading === "auto" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}自动分配
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">只有已通过 DCR 准入、未封禁且没有活跃循环的用户会出现在候选列表中。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">推荐方案</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="py-8 text-center text-sm text-muted-foreground">加载中...</p> : recommendations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">当前不足 3 名可分配对象</p>
            ) : recommendations.map((plan, index) => (
              <div key={plan.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">方案 {index + 1} · 评分 {plan.score}</p>
                    <p className="mt-1 text-sm">{plan.participants.map((participant, participantIndex) => `${String.fromCharCode(65 + participantIndex)}：${participant.nickname || "未命名用户"}`).join(" → ")} → A</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(actionLoading)}
                    onClick={() => assign({
                      action: "ASSIGN",
                      participantAId: plan.participants[0].id,
                      participantBId: plan.participants[1].id,
                      participantCId: plan.participants[2].id,
                    }, plan.id)}
                  >
                    {actionLoading === plan.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}采用
                  </Button>
                </div>
                <ul className="mt-2 list-inside list-disc text-xs leading-5 text-muted-foreground">
                  {plan.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">最近互助循环</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b bg-muted/40"><th className="p-3 text-left">创建时间</th><th className="p-3 text-left">模式</th><th className="p-3 text-left">状态</th><th className="p-3 text-left">互助链路</th></tr></thead>
            <tbody>
              {cycles.map((cycle) => <tr key={cycle.id} className="border-b"><td className="p-3 text-xs text-muted-foreground">{new Date(cycle.createdAt).toLocaleString("zh-CN")}</td><td className="p-3">{cycle.mode === "THREE_PARTY" ? "三方" : "双方"}</td><td className="p-3">{cycle.status}</td><td className="p-3 text-xs">{cycle.links.map((link) => `${link.direction}: ${link.fromUser.nickname || "未命名"} → ${link.toUser.nickname || "未命名"}（${link.status}）`).join("；")}</td></tr>)}
              {!loading && cycles.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">暂无互助循环</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
