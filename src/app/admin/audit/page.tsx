"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipHash: string | null;
  createdAt: string;
  operatorId: string;
  operator: { id: string; nickname: string | null; email: string | null } | null;
}

const AUDIT_ACTIONS = [
  "ROLE_CHANGE",
  "USER_BAN",
  "USER_UNBAN",
  "SHADOW_BAN",
  "CONTENT_APPROVE",
  "CONTENT_REJECT",
  "REPORT_RESOLVE",
  "REPORT_DISMISS",
  "DCR_ACCESS_GRANT",
  "DCR_ACCESS_REVOKE",
  "CASE_EXPORT",
  "CASE_ACCESS",
  "BOARD_PERMISSION_CHANGE",
  "PSYCH_ACCESS_GRANT",
  "UNAUTHORIZED_ACCESS",
  "INVITE_CREATE",
  "INVITE_REVOKE",
] as const;

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (actionFilter) params.set("action", actionFilter);
      if (operatorFilter) params.set("operatorId", operatorFilter);
      if (startDate) params.set("startDate", new Date(startDate).toISOString());
      if (endDate) params.set("endDate", new Date(endDate).toISOString());

      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, operatorFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCSV = () => {
    const params = new URLSearchParams({ format: "csv", pageSize: "1000" });
    if (actionFilter) params.set("action", actionFilter);
    if (operatorFilter) params.set("operatorId", operatorFilter);
    if (startDate) params.set("startDate", new Date(startDate).toISOString());
    if (endDate) params.set("endDate", new Date(endDate).toISOString());
    window.open(`/api/admin/audit?${params}`, "_blank");
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">审计日志</h1>
        <Button onClick={handleExportCSV}>导出 CSV</Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="actionFilter" className="block text-sm mb-1">操作类型</label>
            <select
              id="actionFilter"
              aria-label="按操作类型筛选"
              className="border rounded px-3 py-2 text-sm"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            >
              <option value="">全部</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="operatorFilter" className="block text-sm mb-1">操作者 ID</label>
            <input
              id="operatorFilter"
              type="text"
              placeholder="输入操作者 ID"
              className="border rounded px-3 py-2 text-sm w-48"
              value={operatorFilter}
              onChange={(e) => { setOperatorFilter(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label htmlFor="startDate" className="block text-sm mb-1">开始日期</label>
            <input
              id="startDate"
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm mb-1">结束日期</label>
            <input
              id="endDate"
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3">时间</th>
                      <th className="text-left p-3">操作者</th>
                      <th className="text-left p-3">操作类型</th>
                      <th className="text-left p-3">目标类型</th>
                      <th className="text-left p-3">目标 ID</th>
                      <th className="text-left p-3">详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </td>
                        <td className="p-3 text-xs">
                          {log.operator?.nickname || log.operator?.email || log.operatorId}
                        </td>
                        <td className="p-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-xs">{log.targetType}</td>
                        <td className="p-3 text-xs font-mono">{log.targetId}</td>
                        <td className="p-3 text-xs max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">共 {total} 条日志</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-sm py-1 px-2">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
