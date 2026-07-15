"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UserOption { id: string; nickname: string | null; avatar: string | null }
type CycleMode = "TWO_PARTY" | "THREE_PARTY";

function ParticipantPicker({ label, value, onChange }: { label: string; value: UserOption | null; onChange: (user: UserOption | null) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2 || value) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?type=users&pageSize=8&q=${encodeURIComponent(query.trim())}`);
        const data = await res.json().catch(() => null);
        setResults(res.ok ? data?.results ?? [] : []);
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, value]);

  return <div className="space-y-2">
    <Label>{label}</Label>
    {value ? <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"><span>{value.nickname || "未设置昵称"} <span className="text-xs text-muted-foreground">{value.id}</span></span><button type="button" onClick={() => { onChange(null); setQuery(""); }}><X className="h-4 w-4" /></button></div> : <>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入昵称搜索用户" className="pl-9" /></div>
      {(searching || results.length > 0) && <div className="max-h-44 overflow-y-auto rounded-lg border bg-background p-1 shadow-sm">{searching ? <p className="p-2 text-xs text-muted-foreground">搜索中...</p> : results.map((user) => <button key={user.id} type="button" onClick={() => { onChange(user); setQuery(user.nickname || ""); setResults([]); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">{user.nickname || "未设置昵称"}<span className="ml-2 text-xs text-muted-foreground">{user.id}</span></button>)}</div>}
    </>}
  </div>;
}

export default function NewCyclePage() {
  const router = useRouter();
  const [mode, setMode] = useState<CycleMode>("TWO_PARTY");
  const [participantB, setB] = useState<UserOption | null>(null);
  const [participantC, setC] = useState<UserOption | null>(null);
  const [descAB, setDescAB] = useState("");
  const [descBA, setDescBA] = useState("");
  const [descBC, setDescBC] = useState("");
  const [descCA, setDescCA] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!participantB || (mode === "THREE_PARTY" && !participantC)) {
      setError(mode === "THREE_PARTY" ? "请选择 B 方和 C 方" : "请选择 B 方");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/dcr/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          participantBId: participantB.id,
          participantCId: mode === "THREE_PARTY" ? participantC?.id : undefined,
          descriptions: mode === "THREE_PARTY"
            ? { AB: descAB, BC: descBC, CA: descCA }
            : { AB: descAB, BA: descBA },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error || "创建失败"); return; }
      router.push(`/dcr/cycles/${data.cycle.id}`);
    } catch { setError("网络错误"); } finally { setLoading(false); }
  }

  return <div className="mx-auto max-w-2xl px-4 py-8">
    <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}><ArrowLeft className="mr-1.5 h-4 w-4" />返回</Button>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />创建互助闭环</CardTitle></CardHeader><CardContent>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <div className="grid grid-cols-2 gap-2">
          {(["TWO_PARTY", "THREE_PARTY"] as const).map((item) => <button key={item} type="button" onClick={() => { setMode(item); if (item === "TWO_PARTY") setC(null); }} className={cn("rounded-xl border p-3 text-left", mode === item && "border-primary bg-primary/5 ring-1 ring-primary")}><span className="block text-sm font-medium">{item === "TWO_PARTY" ? "双方互助" : "三方互助"}</span><span className="text-xs text-muted-foreground">{item === "TWO_PARTY" ? "A→B→A" : "A→B→C→A"}</span></button>)}
        </div>
        <div className="rounded-lg bg-blue-50 p-4 text-sm dark:bg-blue-950/20"><strong>当前链路：</strong>{mode === "TWO_PARTY" ? `你(A) → ${participantB?.nickname || "B"} → 你(A)` : `你(A) → ${participantB?.nickname || "B"} → ${participantC?.nickname || "C"} → 你(A)`}<p className="mt-1 text-xs text-muted-foreground">参与者接受互助后会自动获得 Helper 工作台权限。</p></div>
        <ParticipantPicker label="B 方" value={participantB} onChange={setB} />
        {mode === "THREE_PARTY" && <ParticipantPicker label="C 方" value={participantC} onChange={setC} />}
        <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">各段互助说明（选填）</p><Input placeholder="A→B 互助说明" value={descAB} onChange={(e) => setDescAB(e.target.value)} />{mode === "TWO_PARTY" ? <Input placeholder="B→A 互助说明" value={descBA} onChange={(e) => setDescBA(e.target.value)} /> : <><Input placeholder="B→C 互助说明" value={descBC} onChange={(e) => setDescBC(e.target.value)} /><Input placeholder="C→A 互助说明" value={descCA} onChange={(e) => setDescCA(e.target.value)} /></>}</div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />创建中...</> : `创建${mode === "TWO_PARTY" ? "双方" : "三方"}互助`}</Button>
      </form>
    </CardContent></Card>
  </div>;
}
