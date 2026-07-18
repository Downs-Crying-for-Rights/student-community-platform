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
  violationCount: number;
  phone: string | null;
  psychAccess: boolean;
  dcrAccess: boolean;
  dcrPledgeSigned: boolean;
  quizPassed: boolean;
  onboardingDone: boolean;
  createdAt: string;
}

interface PunishmentItem {
  id: string;
  type: "ACCOUNT_BAN" | "POST_SHADOW_HIDE";
  action: "APPLIED" | "REVOKED";
  reason: string;
  createdAt: string;
  operator: { id: string; nickname: string | null; phone: string | null };
}

const ROLES = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"] as const;
const ROLE_LABELS: Record<string, string> = {
  USER: "普通用户", TRUSTED_USER: "可信用户", MODERATOR: "内容版主",
  ADMIN: "管理员", DCR_HELPER: "DCR 互助员", SUPER_ADMIN: "超级管理员",
};
const OVERRIDE_FIELDS = [
  { key: "psychAccess", label: "心理交流区准入权限", description: "开启后可访问心理交流区；关闭后不能访问。申请审核状态不等于此权限。" },
  { key: "dcrAccess", label: "DCR 准入授权", description: "DCR 的授权开关。正常使用还需要已签署 DCR 私密区守则。" },
  { key: "dcrPledgeSigned", label: "已签署 DCR 私密区守则", description: "需与 DCR 准入授权同时开启，用户才能按统一准入规则使用 DCR。" },
  { key: "quizPassed", label: "已通过 DCR 入频考核", description: "只表示考核通过，不会单独授予 DCR 权限；仍需手机号、委托审核和准入授权。" },
  { key: "onboardingDone", label: "已完成平台新手引导", description: "表示完成平台引导；考核已通过的用户也不会再被强制跳转到引导页。" },
] as const;

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
  const [punishments, setPunishments] = useState<PunishmentItem[]>([]);
  const [punishmentsLoading, setPunishmentsLoading] = useState(false);
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
    const promptText = action === "unban" ? "请输入解除处罚的原因：" : shadowBan ? "请输入帖子影子隐藏的处罚原因：" : "请输入账号封禁的处罚原因：";
    const reason = window.prompt(promptText);
    if (reason === null) return;
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, shadowBan, reason: reason.trim() || undefined }),
    });
    if (res.ok) fetchUsers();
  };

  const handleOpenDetails = async (user: UserItem) => {
    setEditingUser(user);
    setOverrideForm({
      violationCount: user.violationCount,
      psychAccess: user.psychAccess,
      dcrAccess: user.dcrAccess,
      dcrPledgeSigned: user.dcrPledgeSigned,
      quizPassed: user.quizPassed,
      onboardingDone: user.onboardingDone,
    });
    setPunishmentsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/punishments`);
      const data = res.ok ? await res.json() : { punishments: [] };
      setPunishments(data.punishments ?? []);
    } finally {
      setPunishmentsLoading(false);
    }
  };

  const handleConfirmOverride = () => {
    setShowConfirmDialog(true);
  };

  const handleSubmitOverride = async () => {
    if (!editingUser) return;
    const changes: Record<string, unknown> = {};
    if (overrideForm.violationCount !== editingUser.violationCount) {
      changes.violationCount = Number(overrideForm.violationCount);
    }
    for (const field of ["psychAccess", "dcrAccess", "dcrPledgeSigned", "quizPassed", "onboardingDone"] as const) {
      if (overrideForm[field] !== undefined && overrideForm[field] !== editingUser[field]) {
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
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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
                      <th className="text-left p-3">违规次数</th>
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
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          {user.isBanned && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">已封禁</span>
                          )}
                          {user.isShadowBanned && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded ml-1">帖子影子隐藏</span>
                          )}
                          {!user.isBanned && !user.isShadowBanned && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">正常</span>
                          )}
                        </td>
                        <td className="p-3">{user.violationCount}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                             <Button
                               variant="outline"
                               size="sm"
                               className="text-xs h-7"
                               onClick={() => handleOpenDetails(user)}
                             >
                               查看详情
                             </Button>
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
                                   帖子影子隐藏
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

      {editingUser && (
        <Card className="relative mt-6 overflow-hidden" data-testid="override-panel">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
            <div className="-rotate-12 whitespace-pre-line text-center text-xl font-semibold leading-10 text-red-700/[0.09]">
              {`敏感内容，严禁外传\n${session?.user?.phone || session?.user?.email || session?.user?.id || "管理员身份未知"}\n${new Date().toLocaleDateString("zh-CN").replaceAll("/", "-")}  查看用户详情${isSuperAdmin ? " / 更新覆写属性" : ""}`}
            </div>
          </div>
          <CardHeader>
            <CardTitle className="text-base">
              用户详情 - {editingUser.nickname || editingUser.id}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 space-y-6">
            <div className="grid gap-3 rounded-lg border bg-background/90 p-4 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">手机号：</span>{editingUser.phone || "未绑定"}</div>
              <div><span className="text-muted-foreground">邮箱：</span>{editingUser.email || "未设置"}</div>
              <div><span className="text-muted-foreground">角色：</span>{ROLE_LABELS[editingUser.role] || editingUser.role}</div>
              <div><span className="text-muted-foreground">注册时间：</span>{new Date(editingUser.createdAt).toLocaleString("zh-CN")}</div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-950">
              <div className="font-semibold">帖子影子隐藏是什么？</div>
              <p className="mt-1 leading-6">开启后，该用户发布的帖子会在帖子列表、帖子详情和搜索结果中对普通其他用户隐藏；用户本人和版主仍可查看。当前不会隐藏评论、私信、群聊消息、个人资料或 DCR 内容，因此它不是全面封禁。</p>
            </div>

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/90 p-4">
              <div>
                <h3 className="font-semibold">更新覆写属性</h3>
                <p className="mt-1 text-xs text-muted-foreground">直接修改数据库中的准入与流程状态。修改后目标用户可能需要刷新会话才会生效。</p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                违规次数
                <input
                  type="number"
                  className="border rounded px-3 py-2"
                  value={overrideForm.violationCount as number ?? 0}
                  onChange={(e) => setOverrideForm((f) => ({ ...f, violationCount: Number(e.target.value) }))}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
              {OVERRIDE_FIELDS.map((field) => (
                <label key={field.key} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!overrideForm[field.key]}
                    onChange={(e) => setOverrideForm((f) => ({ ...f, [field.key]: e.target.checked }))}
                  />
                  <span><span className="block font-medium">{field.label}</span><span className="mt-1 block leading-5 text-muted-foreground">{field.description}</span></span>
                </label>
              ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleConfirmOverride}>提交修改</Button>
              </div>
            </div>}

            <div className="space-y-3 rounded-lg border bg-background/90 p-4">
              <div><h3 className="font-semibold">处罚历史记录</h3><p className="mt-1 text-xs text-muted-foreground">记录账号封禁、帖子影子隐藏及解除操作，最新记录在前。</p></div>
              {punishmentsLoading ? <p className="text-sm text-muted-foreground">加载中...</p> : punishments.length === 0 ? <p className="text-sm text-muted-foreground">暂无处罚记录</p> : (
                <div className="space-y-2">
                  {punishments.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.type === "ACCOUNT_BAN" ? "账号封禁" : "帖子影子隐藏"} · {item.action === "APPLIED" ? "执行处罚" : "解除处罚"}</strong><time className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>
                    <p className="mt-1">原因：{item.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">操作人：{item.operator.nickname || item.operator.phone || item.operator.id}</p>
                  </div>)}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>关闭详情</Button>
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
                {overrideForm.violationCount !== editingUser.violationCount && (
                  <div>违规次数: {editingUser.violationCount} → {overrideForm.violationCount as number}</div>
                )}
                {OVERRIDE_FIELDS.map((field) => overrideForm[field.key] !== editingUser[field.key] ? (
                  <div key={field.key}>{field.label}: {editingUser[field.key] ? "开启" : "关闭"} → {overrideForm[field.key] ? "开启" : "关闭"}</div>
                ) : null)}
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
