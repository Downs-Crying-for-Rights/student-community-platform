"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Loader2,
  User,
  Calendar,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { TimelineView } from "@/components/dcr/TimelineView";
import type { TimelineEvent } from "@/components/dcr/TimelineView";
import { CaseActionButtons } from "@/components/dcr/CaseActionButtons";
import { MessagePanel } from "@/components/dcr/MessagePanel";
import type { CaseStatus } from "@/lib/dcr-ui-helpers";

/* ========== Types ========== */

export interface CaseDetail {
  id: string;
  category: string;
  formData: Record<string, string>;
  status: string;
  pledgeText: string;
  createdAt: string;
  submitter: { id: string; nickname: string | null } | null;
  handler: { id: string; nickname: string | null } | null;
  timeline: TimelineEvent[];
}

/* ========== Pure Functions (exported for testing) ========== */

export const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
};

export const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  OPENED: {
    label: "待处理",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  IN_PROGRESS: {
    label: "处理中",
    className: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  NEED_MORE_INFO: {
    label: "待补充",
    className: "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  },
  CLOSED: {
    label: "已关闭",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  },
};

/**
 * Returns the display label for a case status.
 */
export function getDetailStatusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

/**
 * Returns the display label for a DCR category.
 */
export function getDetailCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * Formats a date string for the detail page.
 */
export function formatDetailDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("zh-CN", {
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

/**
 * Converts formData object keys to human-readable labels.
 */
export const FORM_FIELD_LABELS: Record<string, string> = {
  gradeLevel: "年级",
  subject: "涉及科目",
  feeType: "收费类型",
  amount: "涉及金额",
  situation: "当前情况",
  description: "事项描述",
  expectation: "期望结果",
};

export function getFormFieldLabel(key: string): string {
  return FORM_FIELD_LABELS[key] ?? key;
}

/**
 * Determines if the user should see the export CSV button.
 */
export function shouldShowExportButton(userRole: string | undefined): boolean {
  return userRole === "ADMIN" || userRole === "SUPER_ADMIN";
}

/* ========== Page Component ========== */

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchCase = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCaseData(data.case ?? null);
      } else if (res.status === 404) {
        setError("工单不存在");
      } else if (res.status === 403) {
        setError("无权访问此工单");
      } else {
        setError("加载工单详情失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    if (!id) return;
    fetchCase();
  };

  useEffect(() => {
    if (!id) return;

    // Fetch user session for role and userId
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setUserRole(session?.user?.role);
          setUserId(session?.user?.id ?? "");
        }
      } catch {
        // Ignore session fetch errors
      }
    };

    fetchCase();
    fetchSession();
  }, [id]);

  const handleExportCSV = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/cases/${id}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `case-${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError("导出失败");
      }
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-6">
            <PrivacyBanner />
          </div>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-6">
            <PrivacyBanner />
          </div>
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error ?? "工单数据加载失败"}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="rounded-2xl">
              <Link href="/dcr/tickets">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回工单列表
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[caseData.status];

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Back + Actions */}
        <div className="mb-6 flex items-center justify-between">
          <Button variant="outline" asChild className="rounded-2xl" size="sm">
            <Link href="/dcr/tickets">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回列表
            </Link>
          </Button>

          {shouldShowExportButton(userRole) && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-2xl"
              onClick={handleExportCSV}
              disabled={exporting}
              aria-label="导出 CSV"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              导出 CSV
            </Button>
          )}
        </div>

        {/* Case Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">工单信息</CardTitle>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig?.className ?? ""}`}
              >
                {getDetailStatusLabel(caseData.status)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <dt className="text-sm text-muted-foreground">类型:</dt>
                <dd className="text-sm font-medium text-foreground">
                  {getDetailCategoryLabel(caseData.category)}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <dt className="text-sm text-muted-foreground">创建时间:</dt>
                <dd className="text-sm text-foreground">
                  {formatDetailDate(caseData.createdAt)}
                </dd>
              </div>
              {caseData.submitter && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="text-sm text-muted-foreground">提交者:</dt>
                  <dd className="text-sm text-foreground">
                    {caseData.submitter.nickname ?? "匿名用户"}
                  </dd>
                </div>
              )}
              {caseData.handler && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="text-sm text-muted-foreground">处理人:</dt>
                  <dd className="text-sm text-foreground">
                    {caseData.handler.nickname ?? "未知"}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {userId && userRole && (
          <div className="mb-6">
            <CaseActionButtons
              caseId={caseData.id}
              status={caseData.status as CaseStatus}
              currentUserId={userId}
              currentUserRole={userRole}
              submitterId={caseData.submitter?.id ?? ""}
              handlerId={caseData.handler?.id ?? null}
              onStatusChange={refreshData}
            />
          </div>
        )}

        {/* FormData Display */}
        {caseData.formData && Object.keys(caseData.formData).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">委托表单详情</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                {Object.entries(caseData.formData).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">
                      {getFormFieldLabel(key)}
                    </dt>
                    <dd className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">工单时间线</CardTitle>
          </CardHeader>
          <CardContent>
            <TimelineView events={caseData.timeline ?? []} />
          </CardContent>
        </Card>

        {/* Message Panel */}
        {userId && (
          <MessagePanel
            caseId={caseData.id}
            currentUserId={userId}
            caseStatus={caseData.status as CaseStatus}
          />
        )}
      </div>
    </div>
  );
}
