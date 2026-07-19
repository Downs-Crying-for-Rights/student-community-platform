"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, ExternalLink, Flag, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiReviewPanel } from "@/components/admin/AiReviewPanel";

type ReportStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
type ResolutionAction = "NONE" | "DELETE_TARGET" | "BAN_RESPONSIBLE_USER" | "SHADOW_HIDE_RESPONSIBLE_USER" | "DELETE_TARGET_AND_BAN_USER" | "DELETE_TARGET_AND_SHADOW_HIDE_USER";

interface ReportTargetRecord {
  id: string;
  title?: string;
  name?: string;
  nickname?: string | null;
  content?: string;
  description?: string | null;
  caseId?: string | null;
  threadId?: string;
  roomId?: string;
  authorId?: string;
  senderId?: string;
  createdById?: string;
  status?: string;
  isDeleted?: boolean;
}

interface ReportRecord {
  id: string;
  reason: string;
  details: string | null;
  resolution: string | null;
  resolutionAction?: ResolutionAction | null;
  status: ReportStatus;
  createdAt: string;
  reporter: { id: string; nickname: string | null };
  resolvedBy?: { id: string; nickname: string | null } | null;
  targetUser: ReportTargetRecord | null;
  targetPost: ReportTargetRecord | null;
  targetComment: ReportTargetRecord | null;
  targetTask: ReportTargetRecord | null;
  targetCaseMessage: ReportTargetRecord | null;
  targetHelpMessage: ReportTargetRecord | null;
  targetDmMessage: ReportTargetRecord | null;
  targetChatMessage: ReportTargetRecord | null;
  targetChatRoom: ReportTargetRecord | null;
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: "待处理",
  IN_PROGRESS: "处理中",
  RESOLVED: "已处理",
  DISMISSED: "已驳回",
};

const ACTION_LABELS: Record<ResolutionAction, string> = {
  NONE: "仅记录结论，不修改目标",
  DELETE_TARGET: "删除被举报内容",
  BAN_RESPONSIBLE_USER: "封禁责任用户",
  SHADOW_HIDE_RESPONSIBLE_USER: "隐藏责任用户的帖子",
  DELETE_TARGET_AND_BAN_USER: "删除内容并封禁责任用户",
  DELETE_TARGET_AND_SHADOW_HIDE_USER: "删除内容并隐藏责任用户帖子",
};

export function getReportActions(report: ReportRecord, isAdmin: boolean): ResolutionAction[] {
  const canDelete = Boolean(report.targetPost || report.targetComment);
  const hasResponsibleUser = Boolean(
    report.targetUser || report.targetPost?.authorId || report.targetComment?.authorId
    || report.targetCaseMessage?.senderId || report.targetHelpMessage?.senderId
    || report.targetDmMessage?.senderId || report.targetChatMessage?.senderId
    || report.targetChatRoom?.createdById,
  );
  const actions: ResolutionAction[] = ["NONE"];
  if (canDelete) actions.push("DELETE_TARGET");
  if (isAdmin && hasResponsibleUser) {
    actions.push("BAN_RESPONSIBLE_USER", "SHADOW_HIDE_RESPONSIBLE_USER");
    if (canDelete) actions.push("DELETE_TARGET_AND_BAN_USER", "DELETE_TARGET_AND_SHADOW_HIDE_USER");
  }
  return actions;
}

export function getDefaultReportAction(report: ReportRecord): ResolutionAction {
  return report.targetPost || report.targetComment ? "DELETE_TARGET" : "NONE";
}

export function getReportTarget(report: ReportRecord): { label: string; text: string; href?: string } {
  if (report.targetUser) return { label: "用户", text: report.targetUser.nickname || report.targetUser.id, href: `/u/${report.targetUser.id}` };
  if (report.targetPost) return { label: "帖子", text: report.targetPost.title || report.targetPost.id, href: `/post/${report.targetPost.id}` };
  if (report.targetComment) return { label: "评论", text: report.targetComment.content || report.targetComment.id };
  if (report.targetTask) return { label: "互助任务", text: report.targetTask.title || report.targetTask.id, href: `/dcr/tasks/${report.targetTask.id}` };
  if (report.targetCaseMessage) return { label: "工单消息", text: report.targetCaseMessage.content || report.targetCaseMessage.id, href: report.targetCaseMessage.caseId ? `/dcr/tickets/${report.targetCaseMessage.caseId}` : undefined };
  if (report.targetHelpMessage) return { label: "互助消息", text: report.targetHelpMessage.content || report.targetHelpMessage.id };
  if (report.targetDmMessage) return { label: "私信", text: report.targetDmMessage.content || report.targetDmMessage.id, href: report.targetDmMessage.threadId ? `/messages/dm/${report.targetDmMessage.threadId}` : undefined };
  if (report.targetChatMessage) return { label: "群聊消息", text: report.targetChatMessage.content || report.targetChatMessage.id, href: report.targetChatMessage.roomId ? `/chat/${report.targetChatMessage.roomId}` : undefined };
  if (report.targetChatRoom) return { label: "群聊", text: report.targetChatRoom.name || report.targetChatRoom.id, href: `/chat/${report.targetChatRoom.id}` };
  return { label: "已删除目标", text: "目标内容已被删除或脱敏" };
}

export default function AdminReportsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [status, setStatus] = useState<ReportStatus | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [resolutionById, setResolutionById] = useState<Record<string, string>>({});
  const [actionById, setActionById] = useState<Record<string, ResolutionAction>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ pageSize: "50" });
      if (status !== "ALL") query.set("status", status);
      const response = await fetch(`/api/reports?${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "举报列表加载失败");
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => reports.reduce<Record<string, number>>((result, report) => {
    result[report.status] = (result[report.status] || 0) + 1;
    return result;
  }, {}), [reports]);

  async function update(report: ReportRecord, nextStatus: ReportStatus) {
    const resolution = resolutionById[report.id]?.trim();
    if ((nextStatus === "RESOLVED" || nextStatus === "DISMISSED") && !resolution) {
      setError("完成或驳回举报前必须填写处理结论");
      return;
    }
    setActingId(report.id);
    setError("");
    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          ...(resolution ? { resolution } : {}),
          ...(nextStatus === "RESOLVED" ? { action: actionById[report.id] ?? getDefaultReportAction(report) } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "处理失败");
        return;
      }
      await load();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-screen-xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Flag className="h-6 w-6" />举报处理</h1>
          <p className="mt-1 text-sm text-muted-foreground">处理用户、帖子、评论、任务、群聊及各类消息举报。</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(["PENDING", "IN_PROGRESS", "RESOLVED", "DISMISSED", "ALL"] as const).map((item) => (
          <Button key={item} size="sm" variant={status === item ? "default" : "outline"} onClick={() => setStatus(item)}>
            {item === "ALL" ? "全部" : STATUS_LABELS[item]}{item !== "ALL" && counts[item] ? ` (${counts[item]})` : ""}
          </Button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">当前筛选下暂无举报</div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const target = getReportTarget(report);
            return (
              <Card key={report.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{target.label}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{STATUS_LABELS[report.status]}</span>
                      </div>
                      <p className="mt-2 font-medium">{report.reason}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString("zh-CN")}</span>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-4 whitespace-pre-wrap break-words">{target.text}</p>
                      {target.href && <Button asChild variant="ghost" size="sm"><Link href={target.href}><ExternalLink className="h-4 w-4" />查看</Link></Button>}
                    </div>
                  </div>
                  {report.details && <p className="whitespace-pre-wrap text-sm text-muted-foreground">补充说明：{report.details}</p>}
                  <p className="text-xs text-muted-foreground">举报人：{report.reporter.nickname || report.reporter.id}</p>

                  {(report.status === "PENDING" || report.status === "IN_PROGRESS") && (
                    <AiReviewPanel
                      targetType="REPORT"
                      targetId={report.id}
                      onUseReason={(reason) => setResolutionById((current) => ({ ...current, [report.id]: reason }))}
                    />
                  )}

                  {report.status === "PENDING" && (
                    <Button size="sm" onClick={() => void update(report, "IN_PROGRESS")} disabled={actingId === report.id}>接手处理</Button>
                  )}
                  {report.status === "IN_PROGRESS" && (
                    <div className="space-y-2 border-t pt-3">
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">快捷处置</span>
                        <select
                          value={actionById[report.id] ?? getDefaultReportAction(report)}
                          onChange={(event) => setActionById((current) => ({ ...current, [report.id]: event.target.value as ResolutionAction }))}
                          className="w-full rounded-md border bg-background px-3 py-2"
                        >
                          {getReportActions(report, isAdmin).map((action) => <option key={action} value={action}>{ACTION_LABELS[action]}</option>)}
                        </select>
                      </label>
                      <Input
                        value={resolutionById[report.id] ?? ""}
                        onChange={(event) => setResolutionById((current) => ({ ...current, [report.id]: event.target.value }))}
                        maxLength={2000}
                        placeholder="填写处理结论（必填）"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void update(report, "RESOLVED")} disabled={actingId === report.id}><CheckCircle2 className="h-4 w-4" />接受举报并执行处置</Button>
                        <Button size="sm" variant="outline" onClick={() => void update(report, "DISMISSED")} disabled={actingId === report.id}><XCircle className="h-4 w-4" />驳回举报</Button>
                      </div>
                    </div>
                  )}
                  {report.resolution && <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">处理结论：{report.resolution}</p>}
                  {report.resolutionAction && <p className="text-xs text-muted-foreground">已执行：{ACTION_LABELS[report.resolutionAction]}</p>}
                  {report.resolvedBy && <p className="text-xs text-muted-foreground">处理人：{report.resolvedBy.nickname || report.resolvedBy.id}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
