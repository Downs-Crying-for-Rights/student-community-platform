"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Clock,
  PlayCircle,
  HelpCircle,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatHelperCaseCount } from "@/lib/dcr-ui-helpers";

/* ========== Constants & Types ========== */

const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
};

const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; className: string; icon: typeof Clock }
> = {
  OPENED: {
    label: "待处理",
    className:
      "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "处理中",
    className:
      "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    icon: PlayCircle,
  },
  NEED_MORE_INFO: {
    label: "待补充",
    className:
      "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    icon: HelpCircle,
  },
};

interface CaseSummary {
  id: string;
  category: string;
  status: string;
  createdAt: string;
}

/* ========== Pure Functions (exported for testing) ========== */

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getStatusLabel(status: string): string {
  return STATUS_BADGE_CONFIG[status]?.label ?? status;
}

export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/* ========== Page Component ========== */

export default function HelperDashboardPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const [openCases, setOpenCases] = useState<CaseSummary[]>([]);
  const [myCases, setMyCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setUserRole(session?.user?.role ?? "");
          setUserId(session?.user?.id ?? "");
        }
      } catch {
        // Ignore session errors
      } finally {
        setSessionLoaded(true);
      }
    };
    fetchSession();
  }, []);

  const hasPermission = userRole === "DCR_HELPER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  // Fetch cases once session is loaded and user has permission
  const fetchCases = useCallback(async () => {
    if (!userId || !hasPermission) return;
    setLoading(true);
    setError(null);
    try {
      const [openRes, myRes] = await Promise.all([
        fetch("/api/cases?status=OPENED"),
        fetch(`/api/cases?handlerId=${userId}&status=IN_PROGRESS,NEED_MORE_INFO`),
      ]);

      if (openRes.ok) {
        const data = await openRes.json();
        setOpenCases(data.cases ?? []);
      } else {
        setError("加载待接单工单失败");
      }

      if (myRes.ok) {
        const data = await myRes.json();
        setMyCases(data.cases ?? []);
      } else {
        setError("加载处理中工单失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [userId, hasPermission]);

  useEffect(() => {
    if (sessionLoaded && hasPermission) {
      fetchCases();
    } else if (sessionLoaded) {
      setLoading(false);
    }
  }, [sessionLoaded, hasPermission, fetchCases]);

  // Loading session
  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  // No permission
  if (!hasPermission) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-16 w-16 text-muted-foreground mb-4" aria-hidden="true" />
            <h2 className="text-lg font-medium text-foreground">无权限访问</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              此页面仅对 DCR_HELPER 和管理员开放
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Helper 工作台</h1>
          <span className="text-sm text-muted-foreground">
            处理中: {formatHelperCaseCount(myCases.length, 5)}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        ) : (
          <>
            {/* Section: 待接单工单 */}
            <section className="mb-8">
              <h2 className="mb-4 text-base font-semibold text-foreground">
                待接单工单
              </h2>
              {openCases.length === 0 ? (
                <EmptyState
                  title="暂无待接单工单"
                  description="当前没有等待处理的工单"
                />
              ) : (
                <div className="space-y-3">
                  {openCases.map((c) => (
                    <CaseCard key={c.id} caseItem={c} onClick={() => router.push(`/dcr/tickets/${c.id}`)} />
                  ))}
                </div>
              )}
            </section>

            {/* Section: 我的处理中工单 */}
            <section>
              <h2 className="mb-4 text-base font-semibold text-foreground">
                我的处理中工单
              </h2>
              {myCases.length === 0 ? (
                <EmptyState
                  title="暂无处理中工单"
                  description="您当前没有正在处理的工单"
                />
              ) : (
                <div className="space-y-3">
                  {myCases.map((c) => (
                    <CaseCard key={c.id} caseItem={c} onClick={() => router.push(`/dcr/tickets/${c.id}`)} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function CaseCard({ caseItem, onClick }: { caseItem: CaseSummary; onClick: () => void }) {
  const badge = STATUS_BADGE_CONFIG[caseItem.status];
  const BadgeIcon = badge?.icon ?? Clock;

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`工单 ${getCategoryLabel(caseItem.category)} - ${getStatusLabel(caseItem.status)}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">
              {getCategoryLabel(caseItem.category)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge?.className ?? ""}`}
            >
              <BadgeIcon className="h-3 w-3" aria-hidden="true" />
              {getStatusLabel(caseItem.status)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(caseItem.createdAt)}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}
