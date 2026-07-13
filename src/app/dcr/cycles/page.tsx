"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Repeat,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";

/* ========== Types ========== */

interface CycleLink {
  id: string;
  direction: string;
  status: string;
  fromUser: { id: string; nickname: string };
  toUser: { id: string; nickname: string };
}

interface CycleItem {
  id: string;
  status: string;
  createdAt: string;
  initiator: { id: string; nickname: string };
  links: CycleLink[];
}

/* ========== Config ========== */

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  INITIATING: { label: "组建中", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", icon: Clock },
  ACTIVE: { label: "互助中", className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", icon: Repeat },
  COMPLETED: { label: "已完成", className: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300", icon: CheckCircle2 },
  BROKEN: { label: "已中断", className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300", icon: XCircle },
};

const LINK_STATUS_LABELS: Record<string, string> = {
  PENDING_REQUEST: "待回应",
  ACCEPTED: "已接受",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  REJECTED: "已拒绝",
  DISPUTED: "争议中",
};

const DIRECTION_LABELS: Record<string, string> = {
  AB: "A→B",
  BC: "B→C",
  CA: "C→A",
};

/* ========== Page ========== */

export default function CyclesPage() {
  const router = useRouter();
  const [cycles, setCycles] = useState<CycleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dcr/cycles");
      if (res.ok) {
        const data = await res.json();
        setCycles(data.cycles);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">互助循环</h1>
          <p className="text-sm text-muted-foreground mt-1">三方互助：A→B、B→C、C→A 闭环链路</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dcr/cycles/new">
            <Plus className="mr-1.5 h-4 w-4" />
            创建循环
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : cycles.length === 0 ? (
        <EmptyState icon={Repeat} title="暂无互助循环" description="创建一个三方互助循环，开始互助" action={
          <Button asChild><Link href="/dcr/cycles/new">创建互助循环</Link></Button>
        } />
      ) : (
        <div className="space-y-3">
          {cycles.map((c) => {
            const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.ACTIVE;
            const Icon = config.icon;
            return (
              <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/dcr/cycles/${c.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      发起者: {c.initiator.nickname}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${config.className}`}>
                      <Icon className="h-3 w-3" />{config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.links.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1">
                        <span className="font-mono">{DIRECTION_LABELS[l.direction] || l.direction}</span>
                        <span className="text-muted-foreground/60">{LINK_STATUS_LABELS[l.status]}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
