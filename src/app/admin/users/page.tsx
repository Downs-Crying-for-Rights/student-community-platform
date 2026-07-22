"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, CalendarDays, KeyRound, Search, ShieldCheck, UserRound, X } from "lucide-react";

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
  type: "WARNING" | "TEMPORARY_MUTE" | "PERMANENT_MUTE" | "TEMPORARY_BAN" | "PERMANENT_BAN" | "ACCOUNT_BAN" | "POST_SHADOW_HIDE";
  action: "APPLIED" | "REVOKED";
  reason: string;
  createdAt: string;
  startsAt: string;
  expiresAt: string | null;
  acknowledgedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  operator: { id: string; nickname: string | null };
  revokedBy: { id: string; nickname: string | null } | null;
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

type DataRecord = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  id: "记录 ID", userId: "用户 ID", authorId: "作者 ID", operatorId: "操作人 ID", requesterId: "求助人 ID", helperId: "互助人 ID",
  applicantId: "申请人 ID", reviewerId: "审核人 ID", senderId: "发送人 ID", receiverId: "接收人 ID", targetId: "目标 ID",
  postId: "帖子 ID", commentId: "评论 ID", caseId: "工单 ID", taskId: "任务 ID", roomId: "群聊 ID", threadId: "会话 ID", sessionId: "会话 ID",
  nickname: "昵称", username: "用户名", email: "邮箱", phone: "手机号", bio: "个人简介", value: "内容",
  title: "标题", name: "名称", content: "内容", summary: "摘要", description: "说明", details: "详情", reason: "原因", reviewNote: "审核备注",
  status: "状态", action: "操作", type: "类型", role: "角色", category: "分类", method: "方式", visibility: "可见范围", level: "级别",
  provider: "认证服务", providerAccountId: "服务账号", scope: "授权范围", token_type: "令牌类型", feature: "功能", model: "模型",
  route: "路由", duration: "耗时", release: "版本", source: "来源", message: "消息", recommendation: "建议", confidence: "置信度",
  createdAt: "创建时间", updatedAt: "更新时间", reviewedAt: "审核时间", completedAt: "完成时间", closedAt: "关闭时间", expiresAt: "过期时间",
  deliveredAt: "送达时间", processedAt: "处理时间", joinedAt: "加入时间", revokedAt: "撤销时间", publishedAt: "发布时间", expires: "会话到期时间",
  isRead: "已读", isDeleted: "已删除", isAnonymous: "匿名", isPinned: "置顶", isPublished: "已发布", isUsed: "已使用", isRevoked: "已撤销",
  isSystemMessage: "系统消息", isEvidence: "证据消息", forcePopup: "强制弹窗", requesterConfirmed: "求助人已确认", helperConfirmed: "互助人已确认",
  applicantConfirmed: "申请人已确认", attemptCount: "尝试次数", revision: "修订版本", likeCount: "点赞数", commentCount: "评论数",
  evidenceSize: "材料大小", evidenceMime: "材料格式", fileName: "文件名", fileSize: "文件大小", riskLevel: "风险等级",
  targetType: "目标类型", targetUserId: "目标用户", targetPostId: "目标帖子", targetCommentId: "目标评论", resolution: "处理结论",
  oldStatus: "原状态", newStatus: "新状态", rejectionReason: "拒绝原因", closureReason: "关闭原因", expectedHelpType: "期望帮助",
  _count: "数量", board: "板块", room: "群聊", post: "帖子", links: "互助关系", matchRequests: "匹配请求", receipts: "阅读记录", deliveries: "投递记录",
  caseTimeline: "工单时间线", taskTimeline: "任务时间线", cases: "DCR 工单", tasks: "互助任务", grants: "授权记录", drafts: "委托草稿",
  conversation: "QQ 会话", identity: "QQ 身份", inbox: "接收消息", outbox: "发送消息", systemLogs: "系统日志", telemetry: "请求遥测",
  moderation: "审核操作", configuration: "配置变更", pendingRegistration: "待完成 QQ 注册",
};
const PUNISHMENT_LABELS: Record<PunishmentItem["type"], string> = {
  WARNING: "警告", TEMPORARY_MUTE: "临时禁言", PERMANENT_MUTE: "永久禁言", TEMPORARY_BAN: "临时封禁", PERMANENT_BAN: "永久封禁", ACCOUNT_BAN: "账号封禁（旧版）", POST_SHADOW_HIDE: "帖子影子隐藏（旧版）",
};

const COUNT_LABELS: Record<string, string> = {
  posts: "帖子", comments: "评论", likes: "点赞", bookmarks: "收藏", postRevisionsEdited: "编辑修订", postRevisionsReviewed: "审核修订",
  reportsFiled: "发起举报", reportsReceived: "收到举报", reportsResolved: "处理举报", punishmentsReceived: "受到处罚", punishmentsIssued: "执行处罚",
  casesSubmitted: "提交工单", casesHandled: "处理工单", tasksRequested: "互助任务", helpSessions: "互助会话", helpClaims: "互助认领",
  helpMessages: "互助消息", evidenceItems: "证据", taskTimeline: "任务动态", initiatedCycles: "发起循环", linksAsFrom: "提供帮助", linksAsTo: "接受帮助",
  dmThreadsAsP1: "私信会话 A", dmThreadsAsP2: "私信会话 B", dmMessagesSent: "私信消息", chatRooms: "创建群聊", chatMemberships: "加入群聊",
  chatMessages: "群聊消息", chatJoinRequests: "入群申请", chatRoomBans: "群聊封禁", notifications: "通知", announcementReceipts: "公告阅读",
  accounts: "认证账号", sessions: "登录会话", identityVerificationApplications: "身份核验", invitesCreated: "创建邀请", auditLogs: "审计记录",
  systemLogs: "系统日志", telemetryEvents: "遥测事件", moderationActions: "审核操作", configUpdates: "配置更新", aiReviewsRequested: "AI 审核",
};

const COUNT_GROUPS = [
  { title: "社区参与", keys: ["posts", "comments", "likes", "bookmarks", "postRevisionsEdited", "postRevisionsReviewed"] },
  { title: "治理与安全", keys: ["reportsFiled", "reportsReceived", "reportsResolved", "punishmentsReceived", "punishmentsIssued", "moderationActions"] },
  { title: "DCR 互助", keys: ["casesSubmitted", "casesHandled", "tasksRequested", "helpSessions", "helpClaims", "helpMessages", "evidenceItems", "initiatedCycles"] },
  { title: "沟通互动", keys: ["dmMessagesSent", "chatMessages", "chatRooms", "chatMemberships", "notifications", "announcementReceipts"] },
  { title: "账户与系统", keys: ["accounts", "sessions", "identityVerificationApplications", "invitesCreated", "auditLogs", "systemLogs", "telemetryEvents", "aiReviewsRequested"] },
] as const;

const isRecord = (value: unknown): value is DataRecord => !!value && typeof value === "object" && !Array.isArray(value);
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
const formatDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN") : null;
const displayScalar = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return key === "duration" ? `${Math.round(value)} ms` : value.toLocaleString("zh-CN");
  return formatDate(value) ?? String(value);
};

function StatusPill({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted/50 text-muted-foreground"}`}>{children}</span>;
}

function StructuredValue({ name, value, depth = 0 }: { name: string; value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return <div className="space-y-2"><div className="text-xs font-medium text-muted-foreground">{fieldLabel(name)}</div><div className="space-y-2">{value.slice(0, 12).map((item, index) => isRecord(item) ? <div key={index} className="rounded-md border bg-background p-2"><RecordFields record={item} depth={depth + 1} /></div> : <StatusPill key={index}>{displayScalar(name, item)}</StatusPill>)}</div></div>;
  }
  if (isRecord(value)) return <div className="space-y-2"><div className="text-xs font-medium text-muted-foreground">{fieldLabel(name)}</div><div className="rounded-md border bg-background p-2"><RecordFields record={value} depth={depth + 1} /></div></div>;
  return <div className="min-w-0"><div className="text-[11px] text-muted-foreground">{fieldLabel(name)}</div><div className="break-words text-sm">{displayScalar(name, value)}</div></div>;
}

function RecordFields({ record, depth = 0, omit = [] }: { record: DataRecord; depth?: number; omit?: string[] }) {
  const entries = Object.entries(record).filter(([key, value]) => !omit.includes(key) && value !== null && value !== undefined && value !== "");
  if (!entries.length) return <span className="text-xs text-muted-foreground">无更多信息</span>;
  return <div className={depth > 1 ? "space-y-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>{entries.map(([key, value]) => <StructuredValue key={key} name={key} value={value} depth={depth} />)}</div>;
}

function ActivityCard({ item, domain }: { item: unknown; domain: string }) {
  if (!isRecord(item)) return <div className="rounded-lg border p-3 text-sm">{String(item)}</div>;
  const title = [item.title, item.name, item.action, item.feature, item.category, item.type, item.purpose].find((value) => typeof value === "string") as string | undefined;
  const bodyKey = ["content", "summary", "message", "reason", "reviewNote", "description", "recommendation"].find((key) => typeof item[key] === "string" && item[key]);
  const time = item.createdAt ?? item.updatedAt ?? item.reviewedAt ?? item.expiresAt;
  const statusEntries = ["status", "action", "role", "level", "visibility", "method"].filter((key) => item[key] !== undefined);
  const omitted = ["title", "name", "createdAt", "updatedAt", "reviewedAt", "expiresAt", ...statusEntries, ...(bodyKey ? [bodyKey] : [])];
  return <article className="relative rounded-xl border bg-background p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="font-medium">{title || ACTIVITY_DOMAINS.find(([key]) => key === domain)?.[1] || "活动记录"}</p>{typeof item.id === "string" && <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{item.id}</p>}</div>
      {time !== undefined && <time className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{displayScalar("createdAt", time)}</time>}
    </div>
    {!!statusEntries.length && <div className="mt-3 flex flex-wrap gap-1.5">{statusEntries.map((key) => <StatusPill key={key}>{fieldLabel(key)}：{displayScalar(key, item[key])}</StatusPill>)}</div>}
    {bodyKey && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm leading-6">{String(item[bodyKey])}</p>}
    <div className="mt-3"><RecordFields record={item} omit={omitted} /></div>
  </article>;
}

function ActivityItems({ items, domain }: { items: unknown[]; domain: string }) {
  return <div className="space-y-3">{items.map((item, index) => {
    if (isRecord(item) && typeof item.group === "string" && Array.isArray(item.items)) {
      return <section key={`${item.group}-${index}`} className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fieldLabel(item.group)}</h4>{item.items.map((entry, childIndex) => <ActivityCard key={isRecord(entry) && typeof entry.id === "string" ? entry.id : childIndex} item={entry} domain={domain} />)}</section>;
    }
    return <ActivityCard key={isRecord(item) && typeof item.id === "string" ? item.id : index} item={item} domain={domain} />;
  })}</div>;
}

function SummaryDashboard({ summary }: { summary: UserSummary }) {
  const user = summary.user as DataRecord;
  const accountCards = [
    { label: "账号状态", value: user.deactivatedAt ? "已停用" : user.isBanned ? "已封禁" : "正常", good: !user.deactivatedAt && !user.isBanned },
    { label: "角色", value: ROLE_LABELS[String(user.role)] || String(user.role ?? "-"), good: true },
    { label: "资料完整", value: user.profileCompletionRequired ? "待补充" : "已完成", good: !user.profileCompletionRequired },
    { label: "违规次数", value: Number(user.violationCount ?? 0).toLocaleString("zh-CN"), good: Number(user.violationCount ?? 0) === 0 },
  ];
  const capabilities = [
    ["psychAccess", "心理交流区"], ["dcrAccess", "DCR 准入"], ["dcrContributionAccess", "DCR 贡献"],
    ["dcrHelperAccess", "互助工作台"], ["dcrPledgeSigned", "DCR 守则"], ["quizPassed", "DCR 考核"],
    ["onboardingDone", "新手引导"], ["realVerifiedAt", "实名核验"], ["studentVerifiedAt", "学生核验"],
  ] as const;
  const countGroups = COUNT_GROUPS.map((group) => ({
    ...group,
    rows: group.keys.map((key) => ({ key, value: summary.counts[key] ?? 0 })).filter((row) => row.value > 0),
  })).filter((group) => group.rows.length > 0);
  const maxCount = Math.max(1, ...countGroups.flatMap((group) => group.rows.map((row) => row.value)));
  const accounts = Array.isArray(user.accounts) ? user.accounts : [];
  const sessions = Array.isArray(user.sessions) ? user.sessions : [];
  const verifications = Array.isArray(user.identityVerificationApplications) ? user.identityVerificationApplications : [];
  const deletion = isRecord(user.accountDeletionRequest) ? user.accountDeletionRequest : null;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{accountCards.map((card) => <div key={card.label} className="rounded-xl border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className={`mt-1 text-lg font-semibold ${card.good ? "text-emerald-700" : "text-amber-700"}`}>{card.value}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-xl border p-4"><div className="mb-3 flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /><h4 className="font-medium">账户资料</h4></div><div className="grid gap-3 sm:grid-cols-2"><StructuredValue name="nickname" value={user.nickname} /><StructuredValue name="username" value={user.username} /><StructuredValue name="email" value={user.email} /><StructuredValue name="phone" value={user.phone} /><StructuredValue name="createdAt" value={user.createdAt} /><StructuredValue name="updatedAt" value={user.updatedAt} /></div>{typeof user.bio === "string" && user.bio && <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm leading-6">{user.bio}</p>}</section>
      <section className="rounded-xl border p-4"><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h4 className="font-medium">权限与核验</h4></div><div className="flex flex-wrap gap-2">{capabilities.map(([key, label]) => <StatusPill key={key} active={!!user[key]}>{label} · {user[key] ? "有效" : "未完成"}</StatusPill>)}</div><div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><span>邮箱验证：{displayScalar("emailVerified", user.emailVerified)}</span><span>私信同意版本：{displayScalar("dmConsentVersion", user.dmConsentVersion)}</span><span>安全版本：{displayScalar("securityVersion", user.securityVersion)}</span><span>匿名模式：{displayScalar("isAnonymous", user.isAnonymous)}</span></div></section>
    </div>
    <section className="rounded-xl border p-4"><div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><div><h4 className="font-medium">行为分布</h4><p className="text-xs text-muted-foreground">仅展示有记录的数据类型，条形长度按当前用户最高计数缩放。</p></div></div>{countGroups.length ? <div className="grid gap-5 lg:grid-cols-2">{countGroups.map((group) => <div key={group.title}><h5 className="mb-2 text-xs font-semibold text-muted-foreground">{group.title}</h5><div className="space-y-2">{group.rows.map((row) => <div key={row.key} className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-2 text-xs"><span>{COUNT_LABELS[row.key] ?? row.key}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(5, row.value / maxCount * 100)}%` }} /></div><strong className="text-right tabular-nums">{row.value}</strong></div>)}</div></div>)}</div> : <p className="text-sm text-muted-foreground">暂无行为记录</p>}</section>
    <section className="rounded-xl border p-4"><div className="mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><div><h4 className="font-medium">认证与账户安全</h4><p className="text-xs text-muted-foreground">不展示令牌、哈希或身份材料。</p></div></div><div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg bg-muted/30 p-3"><h5 className="text-sm font-medium">认证提供方 · {accounts.length}</h5><div className="mt-2 space-y-2">{accounts.length ? accounts.map((account, index) => <RecordFields key={isRecord(account) && typeof account.id === "string" ? account.id : index} record={isRecord(account) ? account : { value: account }} omit={["id", "userId"]} />) : <p className="text-xs text-muted-foreground">暂无第三方认证</p>}</div></div>
      <div className="rounded-lg bg-muted/30 p-3"><h5 className="text-sm font-medium">登录会话 · {summary.counts.sessions ?? sessions.length}</h5><div className="mt-2 space-y-2">{sessions.length ? sessions.map((session, index) => <div key={isRecord(session) && typeof session.id === "string" ? session.id : index} className="flex items-center justify-between rounded border bg-background px-3 py-2 text-xs"><span>会话 {index + 1}</span><span className="text-muted-foreground">到期：{isRecord(session) ? displayScalar("expiresAt", session.expires) : "-"}</span></div>) : <p className="text-xs text-muted-foreground">暂无有效会话</p>}</div></div>
      <div className="rounded-lg bg-muted/30 p-3 md:col-span-2"><h5 className="text-sm font-medium">身份核验 · {verifications.length}</h5><div className="mt-2 grid gap-2 md:grid-cols-2">{verifications.length ? verifications.map((verification, index) => <div key={isRecord(verification) && typeof verification.id === "string" ? verification.id : index} className="rounded border bg-background p-3"><RecordFields record={isRecord(verification) ? verification : { value: verification }} omit={["id", "applicantId", "reviewerId"]} /></div>) : <p className="text-xs text-muted-foreground">暂无核验申请</p>}</div></div>
      {!!(user.qqIdentity || user.pendingQQRegistration) && <div className="rounded-lg bg-muted/30 p-3"><h5 className="text-sm font-medium">QQ 绑定</h5><div className="mt-2"><RecordFields record={{ identity: user.qqIdentity, pendingRegistration: user.pendingQQRegistration }} /></div></div>}
      {deletion && <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3"><h5 className="text-sm font-medium text-amber-900">账号注销申请</h5><div className="mt-2"><RecordFields record={deletion} omit={["id", "reviewerId"]} /></div></div>}
    </div></section>
  </div>;
}

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
  const [punishmentForm, setPunishmentForm] = useState({ type: "WARNING", durationMinutes: "1440", reason: "" });
  const [punishmentSaving, setPunishmentSaving] = useState(false);
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

  const reloadPunishments = async () => {
    if (!editingUser) return;
    const response = await fetch(`/api/admin/users/${editingUser.id}/punishments?pageSize=20`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "加载处罚历史失败");
    setPunishments(data.punishments ?? []);
  };

  const handleApplyPunishment = async () => {
    if (!editingUser) return;
    setPunishmentSaving(true); setDetailError("");
    try {
      const temporary = punishmentForm.type === "TEMPORARY_MUTE" || punishmentForm.type === "TEMPORARY_BAN";
      const response = await fetch(`/api/admin/users/${editingUser.id}/punishments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: punishmentForm.type, reason: punishmentForm.reason, ...(temporary ? { durationMinutes: Number(punishmentForm.durationMinutes) } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "执行处罚失败");
      setPunishmentForm((form) => ({ ...form, reason: "" }));
      await Promise.all([reloadPunishments(), fetchUsers()]);
    } catch (error) { setDetailError(error instanceof Error ? error.message : "执行处罚失败"); }
    finally { setPunishmentSaving(false); }
  };

  const handleRevokePunishment = async (punishmentId: string) => {
    if (!editingUser) return;
    const reason = window.prompt("请输入解除处罚的原因：");
    if (!reason?.trim()) return;
    const response = await fetch(`/api/admin/users/${editingUser.id}/punishments/${punishmentId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setDetailError(data.error || "解除处罚失败"); return; }
    await Promise.all([reloadPunishments(), fetchUsers()]);
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

  const closeDetails = () => {
    detailRequestRef.current += 1;
    setShowConfirmDialog(false);
    setEditingUser(null);
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

      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => { if (!open) closeDetails(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl" data-testid="override-panel">
          {editingUser && <>
          <DialogHeader>
            <DialogTitle>
              用户详情 - {editingUser.nickname || editingUser.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid gap-3 rounded-lg border bg-background/90 p-4 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">手机号：</span>{editingUser.phone || "未绑定"}</div>
              <div><span className="text-muted-foreground">邮箱：</span>{editingUser.email || "未设置"}</div>
              <div><span className="text-muted-foreground">角色：</span>{ROLE_LABELS[editingUser.role] || editingUser.role}</div>
              <div><span className="text-muted-foreground">注册时间：</span>{new Date(editingUser.createdAt).toLocaleString("zh-CN")}</div>
            </div>

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/95 p-4">
              <div>
                <h3 className="font-semibold">完整账户摘要</h3>
                <p className="mt-1 text-xs text-muted-foreground">按账户状态、准入能力、认证安全与行为分布呈现。密钥、令牌、哈希和原始身份材料永不返回。</p>
              </div>
              {summaryLoading ? <p className="text-sm text-muted-foreground">加载摘要中...</p> : summary ? <SummaryDashboard summary={summary} /> : <p className="text-sm text-destructive">摘要不可用</p>}
            </div>}

            {isSuperAdmin && <div className="space-y-4 rounded-lg border bg-background/95 p-4">
              <div><h3 className="font-semibold">数据域浏览器</h3><p className="mt-1 text-xs text-muted-foreground">每次仅加载一个域，每页最多 20 条。带“超级管理员”的正文或诊断读取会写入审计日志。</p></div>
              <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="用户数据域">
                {ACTIVITY_DOMAINS.map(([key, label, restricted]) => <button key={key} type="button" role="tab" aria-selected={activityDomain === key} disabled={!!restricted && !isSuperAdmin} onClick={() => { setActivityDomain(key); setActivityPage(1); setDetailError(""); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${activityDomain === key ? "bg-primary text-primary-foreground" : "bg-background"} disabled:cursor-not-allowed disabled:opacity-40`}>{label}{restricted ? " · 超级管理员" : ""}</button>)}
              </div>
              {activityLoading ? <p className="text-sm text-muted-foreground">加载数据域中...</p> : activity ? <>
                <div className="flex items-center justify-between text-xs text-muted-foreground"><span>共 {activity.total} 条</span><span>{activity.page} / {Math.max(1, activity.totalPages)}</span></div>
                {activity.items.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">此域暂无记录</p> : <ActivityItems items={activity.items} domain={activityDomain} />}
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
              <div><h3 className="font-semibold">执行结构化处罚</h3><p className="mt-1 text-xs text-muted-foreground">警告和禁言要求用户确认；临时处罚必须设置时长。</p></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">类型<select value={punishmentForm.type} onChange={(event) => setPunishmentForm((form) => ({ ...form, type: event.target.value }))} className="mt-1 block w-full rounded-md border bg-background px-3 py-2"><option value="WARNING">警告</option><option value="TEMPORARY_MUTE">临时禁言</option><option value="PERMANENT_MUTE">永久禁言</option><option value="TEMPORARY_BAN">临时封禁</option><option value="PERMANENT_BAN">永久封禁</option></select></label>
                {(punishmentForm.type === "TEMPORARY_MUTE" || punishmentForm.type === "TEMPORARY_BAN") && <label className="text-sm">时长（分钟）<input type="number" min={1} max={525600} value={punishmentForm.durationMinutes} onChange={(event) => setPunishmentForm((form) => ({ ...form, durationMinutes: event.target.value }))} className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label>}
                <label className="text-sm sm:col-span-2">原因<textarea value={punishmentForm.reason} onChange={(event) => setPunishmentForm((form) => ({ ...form, reason: event.target.value }))} maxLength={500} rows={3} className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label>
              </div>
              {detailError && <p role="alert" className="text-sm text-destructive">{detailError}</p>}
              <Button size="sm" disabled={punishmentSaving || !punishmentForm.reason.trim()} onClick={handleApplyPunishment}>{punishmentSaving ? "执行中..." : "执行处罚"}</Button>
              <div className="border-t pt-3"><h3 className="font-semibold">处罚历史记录</h3><p className="mt-1 text-xs text-muted-foreground">包含新处罚及旧版兼容记录，最新记录在前。</p></div>
              {punishmentsLoading ? <p className="text-sm text-muted-foreground">加载中...</p> : punishments.length === 0 ? <p className="text-sm text-muted-foreground">暂无处罚记录</p> : (
                <div className="space-y-2">
                  {punishments.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{PUNISHMENT_LABELS[item.type]} · {item.revokedAt || item.action === "REVOKED" ? "已解除" : "已执行"}</strong><time className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>
                    <p className="mt-1">原因：{item.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">操作人：{item.operator.nickname || item.operator.id} · {item.expiresAt ? `到期：${new Date(item.expiresAt).toLocaleString("zh-CN")}` : "无到期时间"}{item.acknowledgedAt ? ` · 已确认：${new Date(item.acknowledgedAt).toLocaleString("zh-CN")}` : ""}</p>
                    {item.revokedAt ? <p className="mt-1 text-xs text-muted-foreground">解除原因：{item.revokeReason} · {item.revokedBy?.nickname || item.revokedBy?.id || "未知"}</p> : item.action === "APPLIED" && <Button className="mt-2" size="sm" variant="outline" onClick={() => handleRevokePunishment(item.id)}>解除处罚</Button>}
                  </div>)}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={closeDetails}>关闭详情</Button>
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
          </div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent data-testid="confirm-dialog">
          <DialogHeader><DialogTitle>确认修改</DialogTitle></DialogHeader>
          {editingUser && <div className="space-y-3">
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
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
