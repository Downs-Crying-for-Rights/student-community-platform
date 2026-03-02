"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TimelineEvent {
  id: string;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  details: string | null;
  createdAt: string;
  operatorId: string | null;
}

interface DisputeItem {
  id: string;
  title: string;
  category: string;
  urgencyLevel: string;
  status: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; nickname: string | null; email: string | null; avatar: string | null };
  helpSession: { id: string; helperId: string; requesterId: string; createdAt: string } | null;
  timeline: TimelineEvent[];
}

type ActionType = "takedown" | "replace_helper" | "ban_user" | "dismiss" | "freeze";

const ACTION_LABELS: Record<ActionType, { text: string; variant: "default" | "destructive" | "outline" | "secondary" }> = {
  takedown: { text: "下架", variant: "destructive" },
  replace_helper: { text: "更换帮助者", variant: "secondary" },
  ban_user: { text: "封禁用户", variant: "destructive" },
  dismiss: { text: "驳回争议", variant: "outline" },
  freeze: { text: "冻结", variant: "destructive" },
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

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ disputeId: string; action: ActionType } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [banTarget, setBanTarget] = useState<"requester" | "helper">("requester");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/disputes");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取争议列表失败");
        return;
      }
      const data = await res.json();
      setDisputes(data.disputes);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const handleStartAction = (disputeId: string, action: ActionType) => {
    setActiveAction({ disputeId, action });
    setActionReason("");
    setBanTarget("requester");
  };

  const handleCancelAction = () => {
    setActiveAction(null);
    setActionReason("");
  };

  const handleSubmitAction = async () => {
    if (!activeAction) return;
    if (!actionReason.trim()) {
      setError("处理原因不能为空");
      return;
    }

    const { disputeId, action } = activeAction;
    const dispute = disputes.find((d) => d.id === disputeId);

    setActionLoading(disputeId);
    setError("");
    try {
      const body: Record<string, string> = { action, reason: actionReason.trim() };

      if (action === "ban_user" && dispute?.helpSession) {
        body.targetUserId = banTarget === "requester"
          ? dispute.helpSession.requesterId
          : dispute.helpSession.helperId;
      }

      const res = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "操作失败");
        return;
      }
      setActiveAction(null);
      setActionReason("");
      fetchDisputes();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const getDisputeExplanation = (timeline: TimelineEvent[]): string | null => {
    const disputeEvent = timeline.find(
      (e) => e.newStatus === "DISPUTED" || e.action === "dispute"
    );
    return disputeEvent?.details || null;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">争议仲裁队列</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">加载中...</div>
      ) : disputes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            暂无待处理争议
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => {
            const urgency = URGENCY_LABELS[dispute.urgencyLevel] || { text: dispute.urgencyLevel, className: "bg-gray-100 text-gray-600" };
            const explanation = getDisputeExplanation(dispute.timeline);
            const isExpanded = expandedId === dispute.id;
            const isActioning = activeAction?.disputeId === dispute.id;
            const isLoading = actionLoading === dispute.id;

            return (
              <Card key={dispute.id}>
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate" title={dispute.title}>
                          {dispute.title}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${urgency.className}`}>
                          {urgency.text}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                          {CATEGORY_LABELS[dispute.category] || dispute.category}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
                          争议中
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{dispute.summary}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs shrink-0"
                      onClick={() => setExpandedId(isExpanded ? null : dispute.id)}
                    >
                      {isExpanded ? "收起" : "展开详情"}
                    </Button>
                  </div>

                  {/* Participants info */}
                  <div className="flex gap-6 text-xs text-muted-foreground mb-3">
                    <span>
                      求助者：{dispute.requester?.nickname || "未设置昵称"}
                      <span className="ml-1 text-gray-400">({dispute.requester?.id?.slice(0, 8)}...)</span>
                    </span>
                    {dispute.helpSession && (
                      <span>
                        帮助者 ID：{dispute.helpSession.helperId.slice(0, 8)}...
                      </span>
                    )}
                    <span>
                      创建时间：{new Date(dispute.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>

                  {/* Dispute explanation */}
                  {explanation && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                      <span className="font-medium text-yellow-800">争议说明：</span>
                      <span className="text-yellow-700">{explanation}</span>
                    </div>
                  )}

                  {/* Expanded timeline */}
                  {isExpanded && dispute.timeline.length > 0 && (
                    <div className="mb-3 p-3 bg-muted/30 rounded">
                      <h4 className="text-xs font-medium mb-2">状态时间线</h4>
                      <div className="space-y-1">
                        {dispute.timeline.map((event) => (
                          <div key={event.id} className="flex items-start gap-2 text-xs">
                            <span className="text-muted-foreground shrink-0">
                              {new Date(event.createdAt).toLocaleString("zh-CN")}
                            </span>
                            <span className="font-medium">{event.action}</span>
                            {event.oldStatus && event.newStatus && (
                              <span className="text-muted-foreground">
                                {event.oldStatus} → {event.newStatus}
                              </span>
                            )}
                            {event.details && (
                              <span className="text-muted-foreground truncate" title={event.details}>
                                {event.details}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action area */}
                  {isActioning ? (
                    <div className="p-3 border rounded bg-muted/20 space-y-3">
                      <div className="text-sm font-medium">
                        操作：{ACTION_LABELS[activeAction.action].text}
                      </div>

                      {activeAction.action === "ban_user" && dispute.helpSession && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">选择封禁对象</label>
                          <div className="flex gap-3">
                            <label className="flex items-center gap-1 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name={`ban-target-${dispute.id}`}
                                checked={banTarget === "requester"}
                                onChange={() => setBanTarget("requester")}
                              />
                              求助者 ({dispute.requester?.nickname || dispute.helpSession.requesterId.slice(0, 8)})
                            </label>
                            <label className="flex items-center gap-1 text-sm cursor-pointer">
                              <input
                                type="radio"
                                name={`ban-target-${dispute.id}`}
                                checked={banTarget === "helper"}
                                onChange={() => setBanTarget("helper")}
                              />
                              帮助者 ({dispute.helpSession.helperId.slice(0, 8)})
                            </label>
                          </div>
                        </div>
                      )}

                      <div>
                        <input
                          type="text"
                          placeholder="请输入处理原因（必填）"
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm w-full"
                          aria-label="处理原因"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant={ACTION_LABELS[activeAction.action].variant}
                          size="sm"
                          className="text-xs h-7"
                          disabled={isLoading || !actionReason.trim()}
                          onClick={handleSubmitAction}
                        >
                          {isLoading ? "提交中..." : "确认执行"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={handleCancelAction}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {(Object.keys(ACTION_LABELS) as ActionType[]).map((action) => (
                        <Button
                          key={action}
                          variant={ACTION_LABELS[action].variant}
                          size="sm"
                          className="text-xs h-7"
                          disabled={isLoading}
                          onClick={() => handleStartAction(dispute.id, action)}
                        >
                          {ACTION_LABELS[action].text}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
