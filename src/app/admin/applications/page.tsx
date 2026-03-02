"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ApplicationItem {
  id: string;
  type: "DCR" | "PSYCHOLOGY";
  status: "PENDING" | "APPROVED" | "REJECTED";
  pledgeText: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  applicant: { id: string; nickname: string | null };
  relatedCase?: {
    formData: Record<string, unknown>;
    pledgeText: string;
    category: string;
    status: string;
  } | null;
}


type TabType = "DCR" | "PSYCHOLOGY";

const TAB_LABELS: Record<TabType, string> = {
  DCR: "DCR 准入",
  PSYCHOLOGY: "心理区准入",
};

const FORM_DATA_LABELS: Record<string, string> = {
  schoolName: "学校名称",
  schoolType: "学校性质",
  schoolAddress: "学校地址",
  reportChannel: "举报途径",
  description: "行为描述",
  feeInfo: "收费情况",
  demands: "诉求列表",
};

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "待审核", className: "bg-yellow-100 text-yellow-700" },
  APPROVED: { text: "已通过", className: "bg-green-100 text-green-700" },
  REJECTED: { text: "已拒绝", className: "bg-red-100 text-red-700" },
};

export default function ApplicationReviewPage() {
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("DCR");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/applications?type=${activeTab}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "获取申请列表失败");
        return;
      }
      const data = await res.json();
      setApplications(data.applications);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const getApiPath = (app: ApplicationItem) => {
    return app.type === "DCR"
      ? `/api/dcr/apply/${app.id}`
      : `/api/psych/apply/${app.id}`;
  };

  const handleApprove = async (app: ApplicationItem) => {
    setActionLoading(app.id);
    setError("");
    try {
      const res = await fetch(getApiPath(app), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "审核操作失败");
        return;
      }
      fetchApplications();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (app: ApplicationItem) => {
    setActionLoading(app.id);
    setError("");
    try {
      const res = await fetch(getApiPath(app), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED", reviewNote: reviewNote.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "审核操作失败");
        return;
      }
      setRejectingId(null);
      setReviewNote("");
      fetchApplications();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setRejectingId(null);
    setReviewNote("");
    setError("");
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">准入申请审核</h1>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6" role="tablist">
        {(Object.keys(TAB_LABELS) as TabType[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-input hover:bg-muted"
            }`}
            onClick={() => handleTabChange(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Application Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">申请人</th>
                    <th className="text-left p-3">申请类型</th>
                    <th className="text-left p-3">申请时间</th>
                    <th className="text-left p-3">状态</th>
                    <th className="text-left p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => {
                    const status = STATUS_LABELS[app.status] || { text: app.status, className: "bg-gray-100 text-gray-700" };
                    const isRejecting = rejectingId === app.id;
                    const isLoading = actionLoading === app.id;
                    const hasRelatedCase = app.type === "DCR" && app.relatedCase;

                    return (
                      <Fragment key={app.id}>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">
                            {app.applicant?.nickname || "未设置昵称"}
                          </td>
                          <td className="p-3 text-xs">
                            {TAB_LABELS[app.type] || app.type}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(app.createdAt).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${status.className}`}>
                              {status.text}
                            </span>
                          </td>
                          <td className="p-3">
                            {app.status === "PENDING" && (
                              <div className="space-y-2">
                                {isRejecting ? (
                                  <div className="flex flex-col gap-2">
                                    <input
                                      type="text"
                                      placeholder="审核备注（可选）"
                                      value={reviewNote}
                                      onChange={(e) => setReviewNote(e.target.value)}
                                      className="border rounded px-3 py-1.5 text-sm w-full min-w-[200px]"
                                      aria-label="审核备注"
                                    />
                                    <div className="flex gap-1">
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        className="text-xs h-7"
                                        disabled={isLoading}
                                        onClick={() => handleReject(app)}
                                      >
                                        {isLoading ? "提交中..." : "确认拒绝"}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => { setRejectingId(null); setReviewNote(""); }}
                                      >
                                        取消
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      className="text-xs h-7"
                                      disabled={isLoading}
                                      onClick={() => handleApprove(app)}
                                    >
                                      {isLoading ? "处理中..." : "通过"}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      className="text-xs h-7"
                                      disabled={isLoading}
                                      onClick={() => setRejectingId(app.id)}
                                    >
                                      拒绝
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                            {app.status === "REJECTED" && app.reviewNote && (
                              <span className="text-xs text-muted-foreground">
                                备注: {app.reviewNote}
                              </span>
                            )}
                          </td>
                        </tr>
                        {hasRelatedCase && (
                          <tr className="bg-muted/10">
                            <td colSpan={5} className="p-0">
                              <details className="w-full">
                                <summary className="px-3 py-2 cursor-pointer text-xs text-primary hover:underline select-none">
                                  查看委托表详情
                                </summary>
                                <div className="px-4 pb-3 pt-1 space-y-2 text-sm">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {Object.entries(FORM_DATA_LABELS).map(([key, label]) => {
                                      const value = app.relatedCase!.formData[key];
                                      if (value === undefined || value === null) return null;
                                      const displayValue = Array.isArray(value) ? value.join("、") : String(value);
                                      return (
                                        <div key={key} className="flex gap-1">
                                          <span className="text-muted-foreground shrink-0">{label}：</span>
                                          <span className="break-all">{displayValue}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {app.relatedCase!.pledgeText && (
                                    <div className="mt-2 pt-2 border-t">
                                      <span className="text-muted-foreground">承诺声明：</span>
                                      <p className="mt-1 text-xs whitespace-pre-wrap">{app.relatedCase!.pledgeText}</p>
                                    </div>
                                  )}
                                </div>
                              </details>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {applications.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        暂无申请
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
