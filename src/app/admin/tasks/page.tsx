"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TaskItem {
  id: string;
  title: string;
  category: string;
  urgencyLevel: string;
  status: string;
  summary: string;
  createdAt: string;
  requester: { id: string; nickname: string | null; avatar: string | null };
  helpSession?: { id: string } | null;
}

/** Statuses that indicate a task has been claimed and may have evidence */
const HAS_EVIDENCE_STATUSES = new Set([
  "CLAIMED", "IN_PROGRESS", "EVIDENCE_PENDING", "COMPLETED", "DISPUTED", "CLOSED",
]);

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  SUBMITTED: { text: "待审核", className: "bg-yellow-100 text-yellow-700" },
  UNDER_REVIEW: { text: "审核中", className: "bg-blue-100 text-blue-700" },
};

const URGENCY_LABELS: Record<string, { text: string; className: string }> = {
  LOW: { text: "低", className: "bg-gray-100 text-gray-600" },
  MEDIUM: { text: "中", className: "bg-blue-100 text-blue-600" },
  HIGH: { text: "高", className: "bg-orange-100 text-orange-700" },
  URGENT: { text: "紧急", className: "bg-red-100 text-red-700" },
};

const CATEGORY_LABELS: Record<string, string> = {
  TUITION: "学费",
  ACCOMMODATION: "住宿",
  CAMPUS_SAFETY: "校园安全",
  ACADEMIC: "学术",
  OTHER: "其他",
};

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [exportConfirmId, setExportConfirmId] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tasks");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取任务列表失败");
        return;
      }
      const data = await res.json();
      setTasks(data.tasks);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAction = async (taskId: string, action: "review" | "approve") => {
    setActionLoading(taskId);
    setError("");
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "操作失败");
        return;
      }
      fetchTasks();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (taskId: string) => {
    if (!rejectReason.trim()) {
      setError("拒绝原因不能为空");
      return;
    }
    setActionLoading(taskId);
    setError("");
    try {
      const res = await fetch(`/api/dcr/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "拒绝操作失败");
        return;
      }
      setRejectingId(null);
      setRejectReason("");
      fetchTasks();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportEvidence = async (taskId: string) => {
    setExportLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/export-evidence`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evidence-export-${taskId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setExportLoading(false);
      setExportConfirmId(null);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">任务审核队列</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">标题</th>
                    <th className="text-left p-3">分类</th>
                    <th className="text-left p-3">紧急度</th>
                    <th className="text-left p-3">状态</th>
                    <th className="text-left p-3">求助者</th>
                    <th className="text-left p-3">创建时间</th>
                    <th className="text-left p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const status = STATUS_LABELS[task.status] || { text: task.status, className: "bg-gray-100 text-gray-700" };
                    const urgency = URGENCY_LABELS[task.urgencyLevel] || { text: task.urgencyLevel, className: "bg-gray-100 text-gray-600" };
                    const isLoading = actionLoading === task.id;
                    const isRejecting = rejectingId === task.id;

                    return (
                      <tr key={task.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium max-w-[200px] truncate" title={task.title}>
                          {task.title}
                        </td>
                        <td className="p-3 text-xs">
                          {CATEGORY_LABELS[task.category] || task.category}
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${urgency.className}`}>
                            {urgency.text}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${status.className}`}>
                            {status.text}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {task.requester?.nickname || "未设置昵称"}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="p-3">
                          {isRejecting ? (
                            <div className="flex flex-col gap-2">
                              <input
                                type="text"
                                placeholder="请输入拒绝原因（必填）"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="border rounded px-3 py-1.5 text-sm w-full min-w-[200px]"
                                aria-label="拒绝原因"
                              />
                              <div className="flex gap-1">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="text-xs h-7"
                                  disabled={isLoading || !rejectReason.trim()}
                                  onClick={() => handleReject(task.id)}
                                >
                                  {isLoading ? "提交中..." : "确认拒绝"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                >
                                  取消
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {task.status === "SUBMITTED" && (
                                <Button
                                  size="sm"
                                  className="text-xs h-7"
                                  disabled={isLoading}
                                  onClick={() => handleAction(task.id, "review")}
                                >
                                  {isLoading ? "处理中..." : "审核"}
                                </Button>
                              )}
                              {task.status === "UNDER_REVIEW" && (
                                <Button
                                  size="sm"
                                  className="text-xs h-7"
                                  disabled={isLoading}
                                  onClick={() => handleAction(task.id, "approve")}
                                >
                                  {isLoading ? "处理中..." : "通过"}
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs h-7"
                                disabled={isLoading}
                                onClick={() => setRejectingId(task.id)}
                              >
                                拒绝
                              </Button>
                              {HAS_EVIDENCE_STATUSES.has(task.status) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  disabled={exportLoading}
                                  onClick={() => setExportConfirmId(task.id)}
                                >
                                  导出证据
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        暂无待审核任务
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 证据导出脱敏提示确认对话框 */}
      {exportConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="导出证据确认">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-3">导出证据确认</h2>
            <p className="text-sm text-muted-foreground mb-4">
              导出的证据可能包含敏感信息，请确认已了解数据脱敏要求。导出操作将记录到审计日志。
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportConfirmId(null)}
                disabled={exportLoading}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => handleExportEvidence(exportConfirmId)}
                disabled={exportLoading}
              >
                {exportLoading ? "导出中..." : "确认导出"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
