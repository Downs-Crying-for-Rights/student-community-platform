"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  ShieldAlert,
  FileText,
  ClipboardList,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";

/* ========== Types ========== */

export interface EvidenceItem {
  id: string;
  type: string;
  description: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  uploaderId: string;
}

export interface EvidenceData {
  items: {
    EVIDENCE_ITEM: EvidenceItem[];
    NOTE: EvidenceItem[];
    OUTCOME: EvidenceItem[];
    FOLLOW_UP: EvidenceItem[];
  };
  total: number;
}

/* ========== Helpers (exported for testing) ========== */

export function formatEvidenceDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export const EVIDENCE_TYPE_OPTIONS = [
  { value: "EVIDENCE_ITEM", label: "过程证据" },
  { value: "NOTE", label: "备注" },
  { value: "OUTCOME", label: "处理结果" },
  { value: "FOLLOW_UP", label: "回访记录" },
] as const;


export const COLUMN_CONFIG = [
  {
    key: "process" as const,
    title: "过程证据",
    types: ["EVIDENCE_ITEM"] as string[],
    icon: FileText,
    defaultType: "EVIDENCE_ITEM",
  },
  {
    key: "outcome" as const,
    title: "结果与回访",
    types: ["OUTCOME", "FOLLOW_UP"] as string[],
    icon: ClipboardList,
    defaultType: "OUTCOME",
  },
  {
    key: "note" as const,
    title: "备注",
    types: ["NOTE"] as string[],
    icon: StickyNote,
    defaultType: "NOTE",
  },
] as const;

/** Merge items from multiple types into a single sorted list */
export function mergeColumnItems(
  items: EvidenceData["items"],
  types: string[],
): EvidenceItem[] {
  const merged: EvidenceItem[] = [];
  for (const t of types) {
    const arr = items[t as keyof EvidenceData["items"]];
    if (arr) merged.push(...arr);
  }
  return merged.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

const SENSITIVE_CONFIRM_MESSAGE =
  "您确认上传的内容不包含敏感个人信息（实名、手机号、精确地址等）？";

/* ========== Component ========== */

export default function EvidenceRoomPage() {
  const params = useParams();
  const taskId = params?.id as string;

  const [data, setData] = useState<EvidenceData | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-form state per column
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [formType, setFormType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSensitiveConfirmed, setFormSensitiveConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  /* ---- Fetch evidence ---- */
  const fetchEvidence = useCallback(async () => {
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}/evidence`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(null);
      } else if (res.status === 403) {
        setError("无权访问证据空间");
      } else if (res.status === 404) {
        setError("证据空间不存在");
      } else {
        setError("加载证据失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  /* ---- Fetch session for role ---- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setUserRole(session?.user?.role ?? "");
        }
      } catch {
        // ignore
      }
    };
    fetchSession();
  }, []);

  useEffect(() => {
    if (taskId) fetchEvidence();
  }, [taskId, fetchEvidence]);

  /* ---- Open add form for a column ---- */
  const openAddForm = (defaultType: string) => {
    setActiveColumn(defaultType);
    setFormType(defaultType);
    setFormDescription("");
    setFormSensitiveConfirmed(false);
    setSubmitError(null);
    setShowConfirmDialog(false);
  };

  const closeAddForm = () => {
    setActiveColumn(null);
    setShowConfirmDialog(false);
  };

  /* ---- Submit evidence ---- */
  const handleSubmitAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim()) {
      setSubmitError("描述不能为空");
      return;
    }
    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmDialog(false);
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          description: formDescription.trim(),
          sensitiveConfirmed: true,
        }),
      });

      if (res.ok) {
        closeAddForm();
        await fetchEvidence();
      } else {
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error ?? "提交失败");
      }
    } catch {
      setSubmitError("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const isPrivileged = ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6">
            <PrivacyBanner
              message="请勿在证据中包含真实姓名、手机号、精确地址等可识别信息"
              dismissible
            />
          </div>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6">
            <PrivacyBanner
              message="请勿在证据中包含真实姓名、手机号、精确地址等可识别信息"
              dismissible
            />
          </div>
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="rounded-2xl">
              <Link href={`/dcr/tasks/${taskId}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回任务详情
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner
            message="请勿在证据中包含真实姓名、手机号、精确地址等可识别信息"
            dismissible
          />
        </div>

        {/* Back link */}
        <div className="mb-6 flex items-center justify-between">
          <Button variant="outline" size="sm" asChild className="rounded-2xl">
            <Link href={`/dcr/tasks/${taskId}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回任务详情
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            共 {data.total} 条证据
          </span>
        </div>

        {/* Audit prompt for Moderator/Admin */}
        {isPrivileged && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>管理员提示：您的所有查看和下载操作均已记录在审计日志中。</span>
          </div>
        )}

        {/* Three-column layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {COLUMN_CONFIG.map((col) => {
            const items = mergeColumnItems(data.items, [...col.types]);
            const Icon = col.icon;
            const isFormOpen = activeColumn === col.defaultType;

            return (
              <Card key={col.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {col.title}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {items.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Item list */}
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      暂无条目
                    </p>
                  ) : (
                    <ul className="space-y-2" aria-label={`${col.title}列表`}>
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-lg border bg-background p-3 text-sm"
                        >
                          <p className="text-foreground whitespace-pre-wrap break-words">
                            {item.description}
                          </p>
                          {item.fileName && (
                            <p className="mt-1 text-xs text-muted-foreground truncate">
                              📎 {item.fileName}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatEvidenceDate(item.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Add button / form */}
                  {!isFormOpen ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full rounded-2xl"
                      onClick={() => openAddForm(col.defaultType)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      添加
                    </Button>
                  ) : (
                    <form
                      onSubmit={handleSubmitAttempt}
                      className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3"
                      aria-label={`添加${col.title}`}
                    >
                      {/* Type select (for multi-type columns) */}
                      {col.types.length > 1 && (
                        <div>
                          <label
                            htmlFor={`type-${col.key}`}
                            className="mb-1 block text-xs font-medium text-muted-foreground"
                          >
                            类型
                          </label>
                          <select
                            id={`type-${col.key}`}
                            value={formType}
                            onChange={(e) => setFormType(e.target.value)}
                            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {col.types.map((t) => {
                              const opt = EVIDENCE_TYPE_OPTIONS.find(
                                (o) => o.value === t,
                              );
                              return (
                                <option key={t} value={t}>
                                  {opt?.label ?? t}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* Description */}
                      <div>
                        <label
                          htmlFor={`desc-${col.key}`}
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          描述
                        </label>
                        <textarea
                          id={`desc-${col.key}`}
                          value={formDescription}
                          onChange={(e) => {
                            setFormDescription(e.target.value);
                            if (submitError) setSubmitError(null);
                          }}
                          placeholder="请输入描述..."
                          rows={3}
                          maxLength={5000}
                          className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          aria-label="证据描述"
                        />
                      </div>

                      {/* Sensitive confirmed checkbox */}
                      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formSensitiveConfirmed}
                          onChange={(e) =>
                            setFormSensitiveConfirmed(e.target.checked)
                          }
                          className="mt-0.5 rounded"
                        />
                        <span>
                          我确认上传内容不包含敏感个人信息
                        </span>
                      </label>

                      {submitError && (
                        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                          {submitError}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={submitting || !formDescription.trim()}
                          className="rounded-2xl"
                        >
                          {submitting && (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          )}
                          提交
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={closeAddForm}
                          className="rounded-2xl"
                        >
                          取消
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ===== Sensitive confirmation dialog ===== */}
        {showConfirmDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-label="敏感信息确认"
          >
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-background p-6 shadow-lg">
              <h2 className="mb-3 text-base font-semibold">上传确认</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                {SENSITIVE_CONFIRM_MESSAGE}
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="rounded-2xl"
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                >
                  {submitting && (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  )}
                  确认上传
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
