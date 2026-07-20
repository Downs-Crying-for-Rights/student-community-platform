"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface UserItem {
  id: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  isBanned: boolean;
  isShadowBanned: boolean;
  violationCount: number;
  phone: string | null;
  psychAccess: boolean;
  dcrAccess: boolean;
  dcrHelperAccess: boolean;
  dcrPledgeSigned: boolean;
  quizPassed: boolean;
  onboardingDone: boolean;
  createdAt: string;
}

interface AdminPostItem {
  id: string;
  title: string;
  content: string;
  status: "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "DELETED";
  createdAt: string;
  board: { id: string; name: string };
}

interface PunishmentItem {
  id: string;
  type: "ACCOUNT_BAN" | "POST_SHADOW_HIDE";
  action: "APPLIED" | "REVOKED";
  reason: string;
  createdAt: string;
  operator: { id: string; nickname: string | null };
}

interface UserSummary {
  user: UserItem & Record<string, unknown>;
  counts: Record<string, number>;
}

interface ActivityResponse {
  domain: string;
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ROLES = ["USER", "TRUSTED_USER", "MODERATOR", "ADMIN", "DCR_HELPER", "SUPER_ADMIN"] as const;
const ROLE_LABELS: Record<string, string> = {
  USER: "普通用户", TRUSTED_USER: "可信用户", MODERATOR: "内容版主",
  ADMIN: "管理员", DCR_HELPER: "DCR 互助员", SUPER_ADMIN: "超级管理员",
};
const OVERRIDE_FIELDS = [
  { key: "psychAccess", label: "心理交流区准入权限", description: "开启后可访问心理交流区；关闭后不能访问。申请审核状态不等于此权限。" },
  { key: "dcrAccess", label: "DCR 准入授权", description: "DCR 的授权开关。正常使用还需要已签署 DCR 私密区守则。" },
  { key: "dcrHelperAccess", label: "DCR 互助工作台权限", description: "开启后可进入 DCR 互助工作台；通常由参与委托、认领或互助循环自动授予。" },
  { key: "dcrPledgeSigned", label: "已签署 DCR 私密区守则", description: "需与 DCR 准入授权同时开启，用户才能按统一准入规则使用 DCR。" },
  { key: "quizPassed", label: "已通过 DCR 入频考核", description: "只表示考核通过，不会单独授予 DCR 权限；仍需手机号、委托审核和准入授权。" },
  { key: "onboardingDone", label: "已完成平台新手引导", description: "表示完成平台引导；考核已通过的用户也不会再被强制跳转到引导页。" },
] as const;

const ACTIVITY_DOMAINS = [
  ["posts", "帖子"], ["revisions", "修订"], ["comments", "评论"], ["likes", "点赞"], ["bookmarks", "收藏"],
  ["reports-filed", "发起举报"], ["reports-received", "收到举报"], ["punishments", "处罚"], ["notifications", "通知"],
  ["dm-threads", "私信会话"], ["dm-messages", "私信正文", true], ["chat-memberships", "群聊成员"],
  ["chat-messages", "群聊正文", true], ["chat-requests", "入群申请"], ["chat-bans", "群聊封禁"],
  ["case-messages", "工单消息正文", true], ["help-sessions", "互助会话"], ["help-messages", "互助消息正文", true],
  ["dcr-cases", "DCR 工单"], ["dcr-applications", "准入申请"], ["dcr-tasks", "互助任务"], ["dcr-claims", "认领"],
  ["dcr-evidence", "证据元数据"], ["dcr-timeline", "任务时间线"], ["dcr-cycles", "互助循环"],
  ["psychology", "心理记录", true], ["dcr-private", "DCR 私密原始内容", true], ["identity", "身份核验"], ["auth-providers", "认证提供方"], ["auth-sessions", "登录会话"],
  ["invites", "邀请"], ["announcements", "公告"], ["qq", "QQ 元数据"], ["qq-private", "QQ 原始交互", true],
  ["audit", "审计", true], ["diagnostics", "系统/遥测", true], ["ai", "AI 诊断", true],
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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [overrideForm, setOverrideForm] = useState<Record<string, unknown>>({});
  const [profileForm, setProfileForm] = useState({ nickname: "", bio: "", avatar: "", email: "", phone: "" });
  const [profileReason, setProfileReason] = useState("");
  const [profileTicketId, setProfileTicketId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [userPosts, setUserPosts] = useState<AdminPostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postForm, setPostForm] = useState({ title: "", content: "" });
  const [postSaving, setPostSaving] = useState(false);
  const [punishments, setPunishments] = useState<PunishmentItem[]>([]);
  const [punishmentsLoading, setPunishmentsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activityDomain, setActivityDomain] = useState("posts");
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);
  const detailRequestRef = useRef(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (roleFilter) params.set("role", roleFilter);
      if (bannedFilter) params.set("isBanned", bannedFilter);
      if (search) params.set("search", search);

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
  }, [page, roleFilter, bannedFilter, search]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    const reason = window.prompt("请输入角色变更原因：");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole, reason: reason.trim() }),
    });
    if (res.ok) fetchUsers();
  };

  const handleBan = async (userId: string, action: "ban" | "unban", shadowBan = false) => {
    const promptText = action === "unban" ? "请输入解除处罚的原因：" : shadowBan ? "请输入帖子影子隐藏的处罚原因：" : "请输入账号封禁的处罚原因：";
    const reason = window.prompt(promptText);
    if (!reason?.trim()) return;
    const res = await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, shadowBan, reason: reason.trim() }),
    });
    if (res.ok) fetchUsers();
  };

  const handleOpenDetails = async (user: UserItem) => {
    const requestId = ++detailRequestRef.current;
    setEditingUser(user);
    setOverrideForm({
      violationCount: user.violationCount,
      psychAccess: user.psychAccess,
      dcrAccess: user.dcrAccess,
      dcrHelperAccess: user.dcrHelperAccess,
      dcrPledgeSigned: user.dcrPledgeSigned,
      quizPassed: user.quizPassed,
      onboardingDone: user.onboardingDone,
    });
    setProfileForm({
      nickname: user.nickname ?? "",
      bio: user.bio ?? "",
      avatar: user.avatar ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
    });
    setDetailError("");
    setProfileReason("");
    setProfileTicketId("");
    setSummary(null);
    setActivity(null);
    setActivityDomain("posts");
    setActivityPage(1);
    setSummaryLoading(true);
    setPunishmentsLoading(true);
    setPostsLoading(true);
    try {
      const [response, punishmentResponse, postsResponse] = await Promise.all([
        isSuperAdmin ? fetch(`/api/admin/users/${user.id}`) : Promise.resolve(null),
        fetch(`/api/admin/users/${user.id}/punishments?pageSize=20`),
        fetch(`/api/admin/posts?authorId=${user.id}&pageSize=20`),
      ]);
      const data = response?.ok ? await response.json() : null;
      const punishmentData = punishmentResponse.ok ? await punishmentResponse.json() : { punishments: [] };
      const postsData = postsResponse.ok ? await postsResponse.json() : { posts: [] };
      if (requestId !== detailRequestRef.current) return;
      if (response && !response.ok) setDetailError(data?.error || "加载用户摘要失败");
      else if (response) setSummary(data);
      setPunishments(punishmentData.punishments ?? []);
      setUserPosts(postsData.posts ?? []);
    } finally {
      if (requestId === detailRequestRef.current) {
        setSummaryLoading(false);
        setPunishmentsLoading(false);
        setPostsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!editingUser || !isSuperAdmin) return;
    const privateDomain = ACTIVITY_DOMAINS.find(([key]) => key === activityDomain)?.[2];
    if (privateDomain && !isSuperAdmin) {
      setActivity(null);
      return;
    }
    const controller = new AbortController();
    setActivityLoading(true);
    fetch(`/api/admin/users/${editingUser.id}/activity?domain=${activityDomain}&page=${activityPage}&pageSize=20`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "加载活动失败");
        setActivity(data);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setDetailError(error.message);
      })
      .finally(() => { if (!controller.signal.aborted) setActivityLoading(false); });
    return () => controller.abort();
  }, [activityDomain, activityPage, editingUser, isSuperAdmin]);

  const handleSaveProfile = async () => {
    if (!editingUser || profileSaving) return;
    setProfileSaving(true);
    setDetailError("");
    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: profileForm.nickname.trim() || null,
          bio: profileForm.bio.trim() || null,
          avatar: profileForm.avatar.trim() || null,
          email: profileForm.email.trim() || null,
          phone: profileForm.phone.trim() || null,
          reason: profileReason.trim(),
          ticketId: profileTicketId.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDetailError(data.error || "保存用户资料失败");
        return;
      }
      setEditingUser((current) => current ? { ...current, ...data.user } : current);
      await fetchUsers();
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePostStatus = async (postId: string, status: AdminPostItem["status"]) => {
    const reason = window.prompt("请输入帖子状态调整原因：");
    if (!reason?.trim()) return;
    const response = await fetch(`/api/admin/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason: reason.trim() }),
    });
    if (response.ok) {
      setUserPosts((posts) => posts.map((post) => post.id === postId ? { ...post, status } : post));
    }
  };

  const openPostEditor = (post: AdminPostItem) => {
    setEditingPostId(post.id);
    setPostForm({ title: post.title, content: post.content });
    setDetailError("");
  };

  const handleSavePost = async () => {
    if (!editingPostId || postSaving) return;
    setPostSaving(true);
    setDetailError("");
    try {
      const reason = window.prompt("请输入管理员纠正帖子正文的原因：");
      if (!reason?.trim()) return;
      const response = await fetch(`/api/admin/posts/${editingPostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: postForm.title.trim(), content: postForm.content.trim(), reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDetailError(data.error || "保存帖子失败");
        return;
      }
      setUserPosts((posts) => posts.map((post) => post.id === editingPostId ? { ...post, ...data.post } : post));
      setEditingPostId(null);
    } finally {
      setPostSaving(false);
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
    for (const field of ["psychAccess", "dcrAccess", "dcrHelperAccess", "dcrPledgeSigned", "quizPassed", "onboardingDone"] as const) {
      if (overrideForm[field] !== undefined && overrideForm[field] !== editingUser[field]) {
        changes[field] = overrideForm[field];
      }
    }
    if (Object.keys(changes).length === 0) {
      setShowConfirmDialog(false);
      return;
    }
    const reason = window.prompt("请输入覆写权限或流程状态的原因：");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/admin/users/${editingUser.id}/override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...changes, reason: reason.trim() }),
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
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜索 ID、昵称、姓名、邮箱、手机号、简介或角色"
                aria-label="搜索用户"
                maxLength={100}
                className="pl-9"
              />
            </div>
            <Button type="submit">搜索</Button>
            {(search || searchInput) && <Button type="button" variant="outline" onClick={clearSearch}><X className="mr-1 h-4 w-4" />清除</Button>}
          </form>
          <div className="flex flex-wrap gap-4">
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
          </div>
          {search && <p className="text-xs text-muted-foreground">正在模糊匹配：{search}</p>}
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

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/95 p-4">
              <div>
                <h3 className="font-semibold">完整账户摘要</h3>
                <p className="mt-1 text-xs text-muted-foreground">安全字段、认证提供方、会话元数据、身份核验元数据与各域计数。密钥、令牌、哈希和原始身份材料永不返回。</p>
              </div>
              {summaryLoading ? <p className="text-sm text-muted-foreground">加载摘要中...</p> : summary ? <>
                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(summary.user).filter(([key]) => !["accounts", "sessions", "identityVerificationApplications", "qqIdentity", "pendingQQRegistration", "accountDeletionRequest"].includes(key)).map(([key, value]) => (
                    <div key={key} className="min-w-0 rounded-md bg-muted/40 px-3 py-2"><span className="text-xs text-muted-foreground">{key}</span><div className="break-all">{value === null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</div></div>
                  ))}
                </div>
                <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">认证、核验、QQ 与注销元数据</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ accounts: summary.user.accounts, sessions: summary.user.sessions, identityVerificationApplications: summary.user.identityVerificationApplications, qqIdentity: summary.user.qqIdentity, pendingQQRegistration: summary.user.pendingQQRegistration, accountDeletionRequest: summary.user.accountDeletionRequest }, null, 2)}</pre></details>
                <div className="flex flex-wrap gap-2">{Object.entries(summary.counts).map(([key, value]) => <span key={key} className="rounded-full border px-2.5 py-1 text-xs"><strong>{key}</strong> {value}</span>)}</div>
              </> : <p className="text-sm text-destructive">摘要不可用</p>}
            </div>}

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/95 p-4">
              <div><h3 className="font-semibold">数据域浏览器</h3><p className="mt-1 text-xs text-muted-foreground">每次仅加载一个域，每页最多 20 条。带“超级管理员”的正文或诊断读取会写入审计日志。</p></div>
              <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="用户数据域">
                {ACTIVITY_DOMAINS.map(([key, label, restricted]) => <button key={key} type="button" role="tab" aria-selected={activityDomain === key} disabled={!!restricted && !isSuperAdmin} onClick={() => { setActivityDomain(key); setActivityPage(1); setDetailError(""); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${activityDomain === key ? "bg-primary text-primary-foreground" : "bg-background"} disabled:cursor-not-allowed disabled:opacity-40`}>{label}{restricted ? " · 超级管理员" : ""}</button>)}
              </div>
              {activityLoading ? <p className="text-sm text-muted-foreground">加载数据域中...</p> : activity ? <>
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>共 {activity.total} 条</span><span>{activity.page} / {Math.max(1, activity.totalPages)}</span></div>
                {activity.items.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">此域暂无记录</p> : <div className="space-y-2">{activity.items.map((item, index) => <pre key={`${activityDomain}-${index}`} className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(item, null, 2)}</pre>)}</div>}
                <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={activityPage <= 1} onClick={() => setActivityPage((value) => value - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={activityPage >= activity.totalPages} onClick={() => setActivityPage((value) => value + 1)}>下一页</Button></div>
              </> : <p className="text-sm text-muted-foreground">选择可访问的数据域。</p>}
            </div>}

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/95 p-4">
              <div><h3 className="font-semibold">编辑身份资料与联系方式</h3><p className="mt-1 text-xs text-muted-foreground">手机号和邮箱必须保持唯一；昵称和简介会经过敏感内容与个人信息检查。</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span className="font-medium">昵称</span><input value={profileForm.nickname} onChange={(event) => setProfileForm((form) => ({ ...form, nickname: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" /></label>
                <label className="space-y-1 text-sm"><span className="font-medium">手机号</span><input value={profileForm.phone} onChange={(event) => setProfileForm((form) => ({ ...form, phone: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" placeholder="未绑定" /></label>
                <label className="space-y-1 text-sm"><span className="font-medium">邮箱</span><input type="email" value={profileForm.email} onChange={(event) => setProfileForm((form) => ({ ...form, email: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" placeholder="未设置" /></label>
                <label className="space-y-1 text-sm"><span className="font-medium">头像 URL</span><input value={profileForm.avatar} onChange={(event) => setProfileForm((form) => ({ ...form, avatar: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" placeholder="留空表示清除" /></label>
              </div>
              <label className="block space-y-1 text-sm"><span className="font-medium">个人简介</span><textarea value={profileForm.bio} onChange={(event) => setProfileForm((form) => ({ ...form, bio: event.target.value }))} rows={3} maxLength={200} className="w-full rounded-md border bg-background px-3 py-2" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span className="font-medium">修改原因</span><input value={profileReason} onChange={(event) => setProfileReason(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" /></label>
                <label className="space-y-1 text-sm"><span className="font-medium">工单或事件编号</span><input value={profileTicketId} onChange={(event) => setProfileTicketId(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" /></label>
              </div>
              {detailError && <p className="text-sm text-destructive" role="alert">{detailError}</p>}
              <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving || !profileReason.trim() || !profileTicketId.trim()}>{profileSaving ? "保存中..." : "保存身份资料"}</Button>
            </div>}

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
                    <p className="mt-1 text-xs text-muted-foreground">操作人：{item.operator.nickname || item.operator.id}</p>
                  </div>)}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => { detailRequestRef.current += 1; setEditingUser(null); }}>关闭详情</Button>
            </div>

            <div className="space-y-3 rounded-lg border bg-background/95 p-4">
              <div><h3 className="font-semibold">该用户的帖子</h3><p className="mt-1 text-xs text-muted-foreground">显示最近 20 篇帖子，可进入详情或调整审核状态；完整分页记录请使用上方数据域浏览器。</p></div>
              {postsLoading ? <p className="text-sm text-muted-foreground">加载中...</p> : userPosts.length === 0 ? <p className="text-sm text-muted-foreground">暂无帖子</p> : <div className="space-y-2">
                {userPosts.map((post) => <div key={post.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">{editingPostId === post.id ? <div className="space-y-2"><input value={postForm.title} maxLength={30} onChange={(event) => setPostForm((form) => ({ ...form, title: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><textarea value={postForm.content} maxLength={10000} rows={5} onChange={(event) => setPostForm((form) => ({ ...form, content: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><div className="flex gap-2"><Button size="sm" onClick={handleSavePost} disabled={postSaving || !postForm.title.trim() || !postForm.content.trim()}>保存正文</Button><Button size="sm" variant="outline" onClick={() => setEditingPostId(null)}>取消</Button></div></div> : <><a href={`/post/${post.id}`} className="font-medium hover:underline">{post.title}</a><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.content}</p><p className="mt-1 text-xs text-muted-foreground">{post.board.name} · {new Date(post.createdAt).toLocaleString("zh-CN")}</p></>}</div>
                  <div className="flex gap-2 sm:flex-col"><Button size="sm" variant="outline" onClick={() => openPostEditor(post)}>编辑内容</Button><select aria-label={`修改帖子 ${post.title} 的状态`} value={post.status} onChange={(event) => handlePostStatus(post.id, event.target.value as AdminPostItem["status"])} className="rounded-md border bg-background px-2 py-1 text-sm"><option value="DRAFT">草稿</option><option value="PENDING">待审核</option><option value="PUBLISHED">已发布</option><option value="REJECTED">已拒绝</option><option value="DELETED">已删除</option></select></div>
                </div>)}
              </div>}
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
