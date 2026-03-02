"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InviteItem {
  id: string;
  code: string;
  isUsed: boolean;
  isRevoked: boolean;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  creator: { id: string; nickname: string | null; email: string | null } | null;
  usedBy: { id: string; nickname: string | null; email: string | null } | null;
}

type StatusFilter = "all" | "unused" | "used" | "revoked";

function getStatusLabel(invite: InviteItem): { text: string; className: string } {
  if (invite.isRevoked) return { text: "已撤销", className: "bg-red-100 text-red-700" };
  if (invite.isUsed) return { text: "已使用", className: "bg-blue-100 text-blue-700" };
  if (new Date(invite.expiresAt) < new Date()) return { text: "已过期", className: "bg-gray-100 text-gray-700" };
  return { text: "未使用", className: "bg-green-100 text-green-700" };
}

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", status: statusFilter });
      const res = await fetch(`/api/admin/invites?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, expiresInDays }),
      });
      if (res.ok) fetchInvites();
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    if (res.ok) fetchInvites();
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">邀请码管理</h1>

      {/* Generate Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">生成邀请码</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="count" className="block text-sm mb-1">数量 (1-10)</label>
            <input
              id="count"
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="border rounded px-3 py-2 text-sm w-24"
            />
          </div>
          <div>
            <label htmlFor="expiresInDays" className="block text-sm mb-1">有效天数 (1-365)</label>
            <input
              id="expiresInDays"
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Math.min(365, Math.max(1, Number(e.target.value))))}
              className="border rounded px-3 py-2 text-sm w-24"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中..." : "生成邀请码"}
          </Button>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            aria-label="按状态筛选"
            className="border rounded px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
          >
            <option value="all">全部</option>
            <option value="unused">未使用</option>
            <option value="used">已使用</option>
            <option value="revoked">已撤销</option>
          </select>
        </CardContent>
      </Card>

      {/* Invite Table */}
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
                      <th className="text-left p-3">邀请码</th>
                      <th className="text-left p-3">创建者</th>
                      <th className="text-left p-3">状态</th>
                      <th className="text-left p-3">创建时间</th>
                      <th className="text-left p-3">过期时间</th>
                      <th className="text-left p-3">使用者</th>
                      <th className="text-left p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => {
                      const status = getStatusLabel(invite);
                      return (
                        <tr key={invite.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{invite.code}</td>
                          <td className="p-3 text-xs">
                            {invite.creator?.nickname || invite.creator?.email || "-"}
                          </td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${status.className}`}>
                              {status.text}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(invite.createdAt).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(invite.expiresAt).toLocaleDateString("zh-CN")}
                          </td>
                          <td className="p-3 text-xs">
                            {invite.usedBy ? (invite.usedBy.nickname || invite.usedBy.email || "匿名") : "-"}
                          </td>
                          <td className="p-3">
                            {!invite.isUsed && !invite.isRevoked && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleRevoke(invite.id)}
                              >
                                撤销
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">共 {total} 个邀请码</span>
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
