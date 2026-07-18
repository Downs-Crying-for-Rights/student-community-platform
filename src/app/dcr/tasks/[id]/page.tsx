"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  MessageCircle,
  FolderOpen,
  Flag,
  CheckCircle,
  HandHelping,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { TimelineView } from "@/components/dcr/TimelineView";

/* ========== Types ========== */

export interface TaskDetail {
  id: string;
  title: string;
  category: string;
  summary: string;
  expectedHelpType: string;
  urgencyLevel: string;
  structuredFields: {
    dateRange?: { start: string; end: string };
    locationGranularity?: string;
    helpCategory?: string;
  };
  riskFlags: string[] | null;
  status: string;
  rejectionReason: string | null;
  closureReason: string | null;
  requesterConfirmed: boolean;
  helperConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  requesterId: string;
  requester: { id: string; nickname: string | null; avatar: string | null };
  helpSessions: Array<{
    id: string;
    helperId: string;
    helpChat: { id: string } | null;
    evidenceRoom: { id: string } | null;
  }>;
  claimsAsTarget: Array<{
    id: string;
    status: string;
    applicantId: string;
    requesterId: string;
    sessionId: string | null;
    offeredTask: { id: string; title: string; summary: string; expectedHelpType: string } | null;
  }>;
  timeline: Array<{
    id: string;
    action: string;
    oldStatus: string | null;
    newStatus: string | null;
    details: string | null;
    createdAt: string;
    taskId: string;
    operatorId: string | null;
  }>;
}

interface OwnTaskOption {
  id: string;
  title: string;
  status: string;
}

/* ========== Pure Functions (exported for testing) ========== */

export const URGENCY_CONFIG: Record<string, { label: string; className: string }> = {
  URGENT: {
    label: "紧急",
    className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  HIGH: {
    label: "高",
    className: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  },
  MEDIUM: {
    label: "中",
    className: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  },
  LOW: {
    label: "低",
    className: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  TUTORING: "补课",
  FEES: "收费",
  WEEKENDS: "双休",
  OTHER: "其他",
};

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "草稿",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  },
  SUBMITTED: {
    label: "已提交",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  UNDER_REVIEW: {
    label: "审核中",
    className: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  OPEN: {
    label: "待领取",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  CLAIMED: {
    label: "已领取",
    className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  },
  IN_PROGRESS: {
    label: "进行中",
    className: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  EVIDENCE_PENDING: {
    label: "待结案",
    className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  COMPLETED: {
    label: "已完成",
    className: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  },
  REJECTED: {
    label: "已拒绝",
    className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  CLOSED: {
    label: "已关闭",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  },
  DISPUTED: {
    label: "争议中",
    className: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
};

export const HELP_CATEGORY_LABELS: Record<string, string> = {
  POLICY_CONSULT: "政策咨询",
  COMMUNICATION_TEMPLATE: "沟通模板",
  MATERIAL_PREP: "材料准备",
  OTHER: "其他",
};

export const LOCATION_LABELS: Record<string, string> = {
  CITY: "市级",
  DISTRICT: "区级",
};

export function getTaskStatusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export function getTaskStatusClassName(status: string): string {
  return STATUS_CONFIG[status]?.className ?? "";
}

export function getTaskCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getTaskUrgencyLabel(level: string): string {
  return URGENCY_CONFIG[level]?.label ?? level;
}

export function getTaskUrgencyClassName(level: string): string {
  return URGENCY_CONFIG[level]?.className ?? "";
}

export function getHelpCategoryLabel(cat: string): string {
  return HELP_CATEGORY_LABELS[cat] ?? cat;
}

export function getLocationLabel(loc: string): string {
  return LOCATION_LABELS[loc] ?? loc;
}

export function formatTaskDate(dateStr: string): string {
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
 * Determines which CTA buttons to show based on task status and user role.
 */
export function getAvailableActions(
  status: string,
  userId: string,
  requesterId: string,
  helperId: string | null,
): {
  canClaim: boolean;
  canStart: boolean;
  canChat: boolean;
  canEvidence: boolean;
  canRequestClose: boolean;
  canConfirmClose: boolean;
} {
  const isParticipant = userId === requesterId || userId === helperId;
  const isHelper = userId === helperId;
  return {
    canClaim: ["OPEN", "CLAIMED", "IN_PROGRESS"].includes(status) && userId !== requesterId,
    canStart: status === "CLAIMED" && isHelper,
    canChat: ["CLAIMED", "IN_PROGRESS", "EVIDENCE_PENDING"].includes(status) && isParticipant,
    canEvidence: ["CLAIMED", "IN_PROGRESS", "EVIDENCE_PENDING"].includes(status) && isParticipant,
    canRequestClose: status === "IN_PROGRESS" && isParticipant,
    canConfirmClose: status === "EVIDENCE_PENDING" && isParticipant,
  };
}


/* ========== Page Component ========== */

export default function TaskDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ownTasks, setOwnTasks] = useState<OwnTaskOption[]>([]);
  const [offeredTaskId, setOfferedTaskId] = useState("");
  const [ownTasksLoading, setOwnTasksLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchTask = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dcr/tasks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTask(data);
      } else if (res.status === 404) {
        setError("任务不存在");
      } else if (res.status === 403) {
        setError("无权访问此任务");
      } else {
        setError("加载任务详情失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setUserId(session?.user?.id ?? "");
        }
      } catch {
        // Ignore session fetch errors
      }
    };

    fetchTask();
    fetchSession();
  }, [id]);

  useEffect(() => {
    if (!userId || !task || userId === task.requesterId) return;
    setOwnTasksLoading(true);
    fetch("/api/dcr/tasks?scope=mine&pageSize=50")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `加载自己的委托失败 (${res.status})`);
        return data;
      })
      .then((data) => {
        const eligible = (data.tasks ?? []).filter((item: OwnTaskOption) =>
          item.id !== task.id && ["OPEN", "CLAIMED", "IN_PROGRESS"].includes(item.status),
        );
        setOwnTasks(eligible);
        setOfferedTaskId((current) => current || eligible[0]?.id || "");
      })
      .catch((fetchError: unknown) => {
        setOwnTasks([]);
        setOfferedTaskId("");
        setActionNotice({
          type: "error",
          message: fetchError instanceof Error ? fetchError.message : "加载自己的委托失败，请稍后重试",
        });
      })
      .finally(() => setOwnTasksLoading(false));
  }, [task, userId]);

  const handleClaim = async () => {
    setActionNotice(null);
    setActionLoading("claim");
    try {
      const res = await fetch(`/api/dcr/tasks/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offeredTaskId: offeredTaskId || null }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionNotice({ type: "success", message: data.message ?? "接取申请已发送，等待对方同意" });
        await fetchTask();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionNotice({ type: "error", message: data.error ?? `领取失败 (${res.status})` });
      }
    } catch {
      setActionNotice({ type: "error", message: "网络错误，接取申请未能发送，请稍后重试" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimDecision = async (claimId: string, action: "accept" | "reject") => {
    setActionNotice(null);
    setActionLoading(`${action}-${claimId}`);
    try {
      const res = await fetch(`/api/dcr/claims/${claimId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionNotice({
          type: "success",
          message: action === "accept" ? "已同意，双方已进入互助流程" : "已拒绝该接取申请",
        });
        await fetchTask();
      } else {
        setActionNotice({ type: "error", message: data.error ?? `处理申请失败 (${res.status})` });
      }
    } catch {
      setActionNotice({ type: "error", message: "网络错误，申请处理失败，请稍后重试" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async () => {
    setActionLoading("start");
    try {
      const res = await fetch(`/api/dcr/tasks/${id}/start`, { method: "POST" });
      if (res.ok) {
        await fetchTask();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "操作失败");
      }
    } catch {
      setError("操作失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async (action: "request" | "confirm") => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/dcr/tasks/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchTask();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "操作失败");
      }
    } catch {
      setError("操作失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  /* ---- Loading state ---- */
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

  /* ---- Error state ---- */
  if (error && !task) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="mb-6">
            <PrivacyBanner />
          </div>
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="rounded-2xl">
              <Link href="/dcr/tasks">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回任务列表
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const mySession = task.helpSessions?.find((session) => session.helperId === userId) ?? task.helpSessions?.[0] ?? null;
  const helperId = mySession?.helperId ?? null;
  const actions = getAvailableActions(task.status, userId, task.requesterId, helperId);
  const hasActiveClaim = task.claimsAsTarget?.some(
    (claim) => claim.applicantId === userId && ["PENDING", "ACCEPTED"].includes(claim.status),
  );
  const acceptedClaims = task.claimsAsTarget?.filter((claim) => claim.status === "ACCEPTED") ?? [];
  const statusCfg = STATUS_CONFIG[task.status];
  const urgencyCfg = URGENCY_CONFIG[task.urgencyLevel];

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Back button */}
        <div className="mb-6">
          <Button variant="outline" asChild className="rounded-2xl" size="sm">
            <Link href="/dcr/tasks">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回列表
            </Link>
          </Button>
        </div>

        {/* Inline error */}
        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}
        {actionNotice && (
          <div
            role={actionNotice.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              actionNotice.type === "error"
                ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                : "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"
            }`}
          >
            {actionNotice.message}
          </div>
        )}

        {/* ===== 1. Header: title, category, urgency, status ===== */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-lg leading-snug">{task.title}</CardTitle>
              <span
                className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg?.className ?? ""}`}
              >
                {getTaskStatusLabel(task.status)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {getTaskCategoryLabel(task.category)}
              </span>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${urgencyCfg?.className ?? ""}`}
              >
                {getTaskUrgencyLabel(task.urgencyLevel)}
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* ===== 2. Structured fields ===== */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">任务信息</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">摘要</dt>
                <dd className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">{task.summary}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">期望帮助类型</dt>
                <dd className="mt-0.5 text-sm text-foreground">{task.expectedHelpType}</dd>
              </div>
              {task.structuredFields?.helpCategory && (
                <div>
                  <dt className="text-xs text-muted-foreground">涉及类型</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {getHelpCategoryLabel(task.structuredFields.helpCategory)}
                  </dd>
                </div>
              )}
              {task.structuredFields?.dateRange && (
                <div>
                  <dt className="text-xs text-muted-foreground">时间范围</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {task.structuredFields.dateRange.start} ~ {task.structuredFields.dateRange.end}
                  </dd>
                </div>
              )}
              {task.structuredFields?.locationGranularity && (
                <div>
                  <dt className="text-xs text-muted-foreground">地点粒度</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {getLocationLabel(task.structuredFields.locationGranularity)}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">创建时间</dt>
                <dd className="mt-0.5 text-sm text-foreground">{formatTaskDate(task.createdAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* ===== Mutual-aid pair ===== */}
        {acceptedClaims.length > 0 && (
          <Card className="mb-6 border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg">双方互助委托</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {acceptedClaims.map((claim, index) => (
                <div key={claim.id} className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs font-medium text-muted-foreground">发起方委托</p>
                    <Link href={`/dcr/tasks/${task.id}`} className="mt-1 block font-medium hover:underline">
                      {task.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">{task.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">期望帮助：{task.expectedHelpType}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {acceptedClaims.length > 1 ? `互助人 ${index + 1} 的委托` : "互助方委托"}
                    </p>
                    {claim.offeredTask ? (
                      <>
                        <Link href={`/dcr/tasks/${claim.offeredTask.id}`} className="mt-1 block font-medium hover:underline">
                          {claim.offeredTask.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">{claim.offeredTask.summary}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          期望帮助：{claim.offeredTask.expectedHelpType}
                        </p>
                      </>
                    ) : (
                      <div className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-200">
                        大好人无偿帮助：互助方没有附带自己的委托。
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ===== 3. Risk flags ===== */}
        {task.riskFlags && Array.isArray(task.riskFlags) && task.riskFlags.length > 0 && (
          <Card className="mb-6 border-amber-200 dark:border-amber-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                风险提示
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {task.riskFlags.map((flag, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {flag}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ===== 4. Status timeline ===== */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">状态时间线</CardTitle>
          </CardHeader>
          <CardContent>
            <TimelineView
              events={(task.timeline ?? []).map((e) => ({
                ...e,
                caseId: e.taskId ?? task.id,
              }))}
            />
          </CardContent>
        </Card>

        {/* ===== 5. CTA buttons ===== */}
        {userId === task.requesterId && task.claimsAsTarget?.some((claim) => claim.status === "PENDING") && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">待确认的互助申请</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {task.claimsAsTarget.filter((claim) => claim.status === "PENDING").map((claim) => (
                <div key={claim.id} className="rounded-xl border p-4">
                  {claim.offeredTask ? (
                    <>
                      <p className="font-medium">对方发送的委托：{claim.offeredTask.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{claim.offeredTask.summary}</p>
                      <p className="mt-1 text-sm text-muted-foreground">期望互助：{claim.offeredTask.expectedHelpType}</p>
                    </>
                  ) : (
                    <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-200">
                      对方申请作为“大好人”无偿帮助你，没有附带自己的委托。
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button disabled={actionLoading !== null} onClick={() => handleClaimDecision(claim.id, "accept")}>同意并进入互助</Button>
                    <Button variant="outline" disabled={actionLoading !== null} onClick={() => handleClaimDecision(claim.id, "reject")}>拒绝</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {userId === task.requesterId && task.helpSessions.length > 1 && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">已建立的互助会话</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {task.helpSessions.map((session, index) => (
                <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <span className="text-sm">互助人 {index + 1}（{session.helperId.slice(0, 8)}…）</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dcr/tasks/${id}/chat?sessionId=${session.id}`}>私聊</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dcr/tasks/${id}/evidence?sessionId=${session.id}`}>证据区</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {userId && (
          <div className="mb-6 flex flex-wrap gap-3">
            {actions.canClaim && !hasActiveClaim && (
              <div className="rounded-2xl border p-3">
                {ownTasksLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    正在加载你的委托…
                  </div>
                ) : ownTasks.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      你当前没有可交换的委托，仍可作为“大好人”无偿帮助对方。
                    </p>
                    <Button
                      size="sm"
                      className="rounded-2xl"
                      disabled={actionLoading === "claim"}
                      onClick={handleClaim}
                    >
                      {actionLoading === "claim" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <HandHelping className="h-4 w-4" aria-hidden="true" />
                      )}
                      作为大好人帮助
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={offeredTaskId}
                      onChange={(event) => setOfferedTaskId(event.target.value)}
                      className="h-9 max-w-xs rounded-xl border bg-background px-3 text-sm"
                      aria-label="选择发送给对方的委托"
                    >
                      <option value="">无偿帮助，不附带我的委托</option>
                      {ownTasks.map((item) => (
                        <option key={item.id} value={item.id}>{item.title}</option>
                      ))}
                    </select>
                    <Button
                      className="rounded-2xl"
                      disabled={actionLoading === "claim"}
                      onClick={handleClaim}
                    >
                      {actionLoading === "claim" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <HandHelping className="h-4 w-4" aria-hidden="true" />
                      )}
                      {offeredTaskId ? "接下并发送我的委托" : "作为大好人帮助"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {actions.canStart && (
              <Button
                className="rounded-2xl"
                disabled={actionLoading === "start"}
                onClick={handleStart}
              >
                {actionLoading === "start" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                开始处理
              </Button>
            )}

            {actions.canChat && (
              <Button variant="outline" className="rounded-2xl" asChild>
                <Link href={`/dcr/tasks/${id}/chat?sessionId=${mySession?.id ?? ""}`}>
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  进入私聊
                </Link>
              </Button>
            )}

            {actions.canEvidence && (
              <Button variant="outline" className="rounded-2xl" asChild>
                <Link href={`/dcr/tasks/${id}/evidence?sessionId=${mySession?.id ?? ""}`}>
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  进入证据区
                </Link>
              </Button>
            )}

            {actions.canRequestClose && (
              <Button
                variant="secondary"
                className="rounded-2xl"
                disabled={actionLoading === "request"}
                onClick={() => handleClose("request")}
              >
                {actionLoading === "request" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                )}
                申请结案
              </Button>
            )}

            {actions.canConfirmClose && (
              <Button
                variant="secondary"
                className="rounded-2xl"
                disabled={actionLoading === "confirm"}
                onClick={() => handleClose("confirm")}
              >
                {actionLoading === "confirm" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                )}
                确认完成
              </Button>
            )}
          </div>
        )}

        {/* ===== 6. Report button ===== */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-600"
            aria-label="举报此任务"
            onClick={async () => {
              const reason = prompt("请输入举报原因");
              if (!reason) return;
              try {
                const res = await fetch("/api/reports", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ targetTaskId: id, reason }),
                });
                if (res.ok) {
                  alert("举报已提交，管理员将尽快处理");
                } else {
                  const data = await res.json().catch(() => ({}));
                  alert(data.error || "举报提交失败");
                }
              } catch {
                alert("网络错误");
              }
            }}
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            举报
          </Button>
        </div>
      </div>
    </div>
  );
}
