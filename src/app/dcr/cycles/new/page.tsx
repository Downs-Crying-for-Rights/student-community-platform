"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCyclePage() {
  const router = useRouter();
  const [participantB, setB] = useState("");
  const [participantC, setC] = useState("");
  const [descAB, setDescAB] = useState("");
  const [descBC, setDescBC] = useState("");
  const [descCA, setDescCA] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!participantB.trim() || !participantC.trim()) {
      setError("请填写B方和C方用户ID");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/dcr/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantBId: participantB.trim(),
          participantCId: participantC.trim(),
          descriptions: { AB: descAB, BC: descBC, CA: descCA },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }

      router.push(`/dcr/cycles/${data.cycle.id}`);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />返回
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />创建互助循环
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/20 text-sm space-y-1">
              <p><strong>互助链路：</strong></p>
              <p>A(你) → B({participantB || "?"}) → C({participantC || "?"}) → A(你)</p>
              <p className="text-xs text-muted-foreground mt-2">
                三方互助：你帮助B，B帮助C，C帮助你，形成闭环互助。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="participantB">B方用户ID（你帮助的人）</Label>
              <Input id="participantB" value={participantB} onChange={(e) => setB(e.target.value)} placeholder="输入用户ID" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="participantC">C方用户ID（B帮助C，C帮助你）</Label>
              <Input id="participantC" value={participantC} onChange={(e) => setC(e.target.value)} placeholder="输入用户ID" required />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">互助说明（选填）</p>
              <div className="space-y-2">
                <Input placeholder="A→B 互助说明" value={descAB} onChange={(e) => setDescAB(e.target.value)} />
                <Input placeholder="B→C 互助说明" value={descBC} onChange={(e) => setDescBC(e.target.value)} />
                <Input placeholder="C→A 互助说明" value={descCA} onChange={(e) => setDescCA(e.target.value)} />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />创建中...</> : "创建互助循环"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
