"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UserItem {
  id: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  role: string;
  isBanned: boolean;
  isShadowBanned: boolean;
  reputationScore: number;
  violationCount: number;
  createdAt: string;
}

const ROLES = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"] as const;

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserRole = (session?.user?.role as string) ?? "USER";
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [bannedFilter, setBannedFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [overrideForm, setOverrideForm] = useState<Record<string, unknown>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (roleFilter) params.set("role", roleFilter);
      if (bannedFilter) params.set("isBanned", bannedFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, bannedFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) fetchUsers();
  };

  const handleBan = async (userId: string, action: "ban" | "unban", shadowBan = false) => {
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, shadowBan }),
    });
    if (res.ok) fetchUsers();
  };

  const handleOpenOverride = (user: UserItem) => {
    setEditingUser(user);
    setOverrideForm({
      reputationScore: user.reputationScore,
      violationCount: user.violationCount,
    });
  };

  const handleConfirmOverride = () => {
    setShowConfirmDialog(true);
  };

  const handleSubmitOverride = async () => {
    if (!editingUser) return;
    const changes: Record<string, unknown> = {};
    if (overrideForm.reputationScore !== editingUser.reputationScore) {
      changes.reputationScore = Number(overrideForm.reputationScore);
    }
    if (overrideForm.violationCount !== editingUser.violationCount) {
      changes.violationCount = Number(overrideForm.violationCount);
    }
    for (const field of ["psychAccess", "dcrAccess", "dcrPledgeSigned", "quizPassed", "onboardingDone"] as const) {
      if (overrideForm[field] !== undefined) {
        changes[field] = overrideForm[field];
      }
    }
    if (Object.keys(changes).length === 0) {
      setShowConfirmDialog(false);
      return;
    }
    const res = await fetch(`/api/admin/users/${editingUser.id}/override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (res.ok) {
      fetchUsers();
      setEditingUser(null);
    }
    setShowConfirmDialog(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">筛选条件</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <select
            aria-label="按角色筛选"
            className="border rounded px-3 py-2 text-sm"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部角色</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            aria-label="按封禁状态筛选"
            className="border rounded px-3 py-2 text-sm"
            value={bannedFilter}
            onChange={(e) => { setBannedFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="true">已封禁</option>
            <option value="false">正常</option>
          </select>
        </CardContent>
      </Card>

      {/* User Table */}
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
                      <th className="text-left p-3">用户</th>
                      <th className="text-left p-3">角色</th>
                      <th className="text-left p-3">状态</th>
                      <th className="text-left p-3">信誉分</th>
                      <th className="text-left p-3">注册时间</th>
                      <th className="text-left p-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <div className="font-medium">{user.nickname || "未设置昵称"}</div>
                          <div className="text-xs text-muted-foreground">{user.email || "匿名"}</div>
                        </td>
                        <td className="p-3">
                          <select
                            aria-label={`变更 ${user.nickname || user.id} 的角色`}
                            className="border rounded px-2 py-1 text-xs"
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          {user.isBanned && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">已封禁</span>
                          )}
                          {user.isShadowBanned && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded ml-1">Shadow Ban</span>
                          )}
                          {!user.isBanned && !user.isShadowBanned && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">正常</span>
                          )}
                        </td>
                        <td className="p-3">{user.reputationScore}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {isSuperAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleOpenOverride(user)}
                              >
                                覆写属性
                              </Button>
                            )}
                            {!user.isBanned && !user.isShadowBanned && (
                              <>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleBan(user.id, "ban")}
                                >
                                  封禁
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleBan(user.id, "ban", true)}
                                >
                                  Shadow Ban
                                </Button>
                              </>
                            )}
                            {(user.isBanned || user.isShadowBanned) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleBan(user.id, "unban")}
                              >
                                解封
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">共 {total} 位用户</span>
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

      {/* SUPER_ADMIN Override Panel */}
      {isSuperAdmin && editingUser && (
        <Card className="mt-6" data-testid="override-panel">
          <CardHeader>
            <CardTitle className="text-base">
              覆写用户属性 - {editingUser.nickname || editingUser.id}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                信誉分
                <input
                  type="number"
                  className="border rounded px-3 py-2"
                  value={overrideForm.reputationScore as number ?? 0}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, reputationScore: Number(e.target.value) }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                违规次数
                <input
                  type="number"
                  className="border rounded px-3 py-2"
                  value={overrideForm.violationCount as number ?? 0}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, violationCount: Number(e.target.value) }))}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              {(["psychAccess", "dcrAccess", "dcrPledgeSigned", "quizPassed", "onboardingDone"] as const).map((field) => (
                <label key={field} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!overrideForm[field]}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, [field]: e.target.checked }))}
                  />
                  {field}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConfirmOverride}>提交修改</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="confirm-dialog">
          <Card className="w-96">
            <CardHeader>
              <CardTitle className="text-base">确认修改</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">请确认以下修改：</p>
              <div className="text-sm space-y-1">
                {overrideForm.reputationScore !== editingUser.reputationScore && (
                  <div>信誉分: {editingUser.reputationScore} → {overrideForm.reputationScore as number}</div>
                )}
                {overrideForm.violationCount !== editingUser.violationCount && (
                  <div>违规次数: {editingUser.violationCount} → {overrideForm.violationCount as number}</div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" onClick={handleSubmitOverride}>确认</Button>
                <Button size="sm" variant="outline" onClick={() => setShowConfirmDialog(false)}>取消</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
