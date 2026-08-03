"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Shield, FileText, AlertTriangle, User, Filter, RefreshCw, ShieldAlert, BadgeCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/shared/Skeleton";
import { AiReviewPanel } from "@/components/admin/AiReviewPanel";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

export interface ModerationPost {
  id: string;
  title: string;
  content: string;
  status: "PENDING" | "PUBLISHED" | "REJECTED" | "DRAFT" | "DELETED";
  createdAt: string;
  author: { id: string; nickname: string | null; avatar: string | null };
  board: { id: string; name: string; zone: string };
  tags: Array<{ tag: { id: string; name: string } }>;
  revisionId?: string;
  currentTitle?: string;
  currentContent?: string;
  safetyPriority?: "URGENT" | "ELEVATED" | "STANDARD";
  safetyNotice?: string | null;
  approvalAudit?: {
    createdAt: string;
    operator: {
      id: string;
      nickname: string | null;
      username: string | null;
      role: string;
    };
  } | null;
}

export interface BoardOption {
  id: string;
  name: string;
  zone: string;
}

export const MODERATION_STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待审核" },
  { value: "PUBLISHED", label: "已通过" },
  { value: "REJECTED", label: "已拒绝" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

export function getModerationStatusLabel(status: string): string {
  return MODERATION_STATUS_FILTERS.find((item) => item.value === status)?.label ?? status;
}

/** Filter posts by content type and board */
export function filterPosts(
  posts: ModerationPost[],
  filterBoard: string,
  filterZone = "",
  filterStatus = "",
): ModerationPost[] {
  return posts.filter((post) =>
    (!filterZone || post.board.zone === filterZone)
    && (!filterBoard || post.board.id === filterBoard)
    && (!filterStatus || post.status === filterStatus),
  );
}

export function getModerationAuthorLabel(post: ModerationPost): string {
  if (post.board.zone === "PSYCHOLOGY") return "心理区匿名用户";
  return post.author.nickname ?? "匿名用户";
}

export function getZoneLabel(zone: string): string {
  if (zone === "PSYCHOLOGY") return "心理区";
  if (zone === "DCR") return "DCR";
  return "公共区";
}

export function getModeratorRoleLabel(role: string): string {
  if (role === "SUPER_ADMIN") return "超级管理员";
  if (role === "ADMIN") return "管理员";
  if (role === "MODERATOR") return "版主";
  return role;
}

export function getApprovalOperatorLabel(post: ModerationPost): string | null {
  const operator = post.approvalAudit?.operator;
  if (!operator) return null;
  return `${operator.nickname || operator.username || "管理员"}（${getModeratorRoleLabel(operator.role)}）`;
}

export function mergeBoardOptions(...groups: BoardOption[][]): BoardOption[] {
  const boards = new Map<string, BoardOption>();
  for (const group of groups) {
    for (const board of group) boards.set(board.id, board);
  }
  return [...boards.values()].sort((a, b) =>
    getZoneLabel(a.zone).localeCompare(getZoneLabel(b.zone), "zh-CN")
    || a.name.localeCompare(b.name, "zh-CN"),
  );
}

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export function canAccessModeration(role: string | undefined): boolean {
  if (!role) return false;
  return (ROLE_HIERARCHY[role] ?? 0) >= ROLE_HIERARCHY.MODERATOR;
}

/* ---------- Main Page ---------- */

export default function ModerationPage() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = (session?.user?.role as string) ?? "USER";

  const [posts, setPosts] = useState<ModerationPost[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterBoard, setFilterBoard] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterStatus, setFilterStatus] = useState("PENDING");
  const [selectedPost, setSelectedPost] = useState<ModerationPost | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch all statuses once so list filters switch without another request.
      const statuses = ["PENDING", "PUBLISHED", "REJECTED"];
      const responses = await Promise.all([
        ...statuses.map((status) =>
          fetch(`/api/moderation/queue?status=${status}&pageSize=50`, { cache: "no-store" })
        ),
        fetch("/api/moderation/revisions", { cache: "no-store" }),
      ]);
      const results = await Promise.all(responses.map(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "审核队列加载失败");
        return data;
      }));
      const allPosts: ModerationPost[] = [
        ...results.slice(0, statuses.length).flatMap((r) => r.posts ?? []),
        ...(results.at(-1)?.revisions ?? []),
      ];
      setPosts(allPosts);
      setBoards((current) => mergeBoardOptions(
        current,
        allPosts.map((post) => post.board),
      ));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "审核队列加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      if (res.ok) {
        const data = await res.json();
        setBoards((current) => mergeBoardOptions(current, data.boards ?? []));
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated" && canAccessModeration(userRole)) {
      fetchPosts();
      fetchBoards();
    }
  }, [sessionStatus, userRole, fetchPosts, fetchBoards]);

  // 403 for non-moderator/admin
  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-screen-xl px-4 pb-24 pt-4">
          <ListSkeleton count={4} />
        </main>
      </div>
    );
  }

  if (!canAccessModeration(userRole)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-screen-xl px-4 pb-24 pt-4">
          <div className="flex flex-col items-center justify-center py-20">
            <Shield className="mb-4 h-16 w-16 text-destructive" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">403 - 无权限访问</h1>
            <p className="mt-2 text-muted-foreground">
              仅版主和管理员可以访问审核看板
            </p>
            <Button asChild className="mt-6">
              <Link href="/">返回首页</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const filtered = filterPosts(posts, filterBoard, filterZone, filterStatus);
  const filteredBoards = filterZone ? boards.filter((board) => board.zone === filterZone) : boards;

  async function handleApprove(postId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/moderation/${postId}/approve`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setDialogOpen(false);
        setSelectedPost(null);
        await fetchPosts();
      } else {
        setActionError(data?.error || "审核操作失败");
      }
    } catch {
      setActionError("网络错误，请重试");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(postId: string) {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/moderation/${postId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setDialogOpen(false);
        setSelectedPost(null);
        setRejectReason("");
        await fetchPosts();
      } else {
        setActionError(data?.error || "审核操作失败");
      }
    } catch {
      setActionError("网络错误，请重试");
    } finally {
      setActionLoading(false);
    }
  }

  function openDetail(post: ModerationPost) {
    setSelectedPost(post);
    setRejectReason("");
    setActionError(null);
    setSafetyAcknowledged(false);
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4")}>
        {/* Header */}
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Shield className="h-6 w-6" aria-hidden="true" />
                内容审核
              </h1>
              <Button type="button" variant="ghost" size="icon" onClick={() => void fetchPosts()} aria-label="刷新审核队列" title="刷新审核队列">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <span className="text-sm tabular-nums text-muted-foreground">{filtered.length} 条</span>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-full overflow-x-auto rounded-md border p-1" role="group" aria-label="按审核状态筛选">
              {MODERATION_STATUS_FILTERS.map(({ value, label }) => (
                <Button
                  key={value || "all"}
                  type="button"
                  size="sm"
                  variant={filterStatus === value ? "secondary" : "ghost"}
                  onClick={() => setFilterStatus(value)}
                  className="h-8 shrink-0 px-3"
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex rounded-md border p-1" role="group" aria-label="按专区筛选">
                {[
                  ["", "全部"],
                  ["PUBLIC", "公共区"],
                  ["PSYCHOLOGY", "心理区"],
                  ["DCR", "DCR"],
                ].map(([value, label]) => (
                  <Button
                    key={value || "all"}
                    type="button"
                    size="sm"
                    variant={filterZone === value ? "secondary" : "ghost"}
                    onClick={() => { setFilterZone(value); setFilterBoard(""); }}
                    className="h-8 px-2.5"
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <select
                  value={filterBoard}
                  onChange={(e) => setFilterBoard(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="按板块筛选"
                >
                  <option value="">全部板块</option>
                  {filteredBoards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchPosts()}>重试</Button>
          </div>
        )}

        {/* Moderation list */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <div className="border-y py-16 text-center text-sm text-muted-foreground sm:rounded-md sm:border">
            暂无符合条件的内容
          </div>
        ) : (
          <div className="overflow-hidden border-y sm:rounded-md sm:border">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_90px_minmax(140px,0.8fr)_minmax(160px,1fr)_130px_20px] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span>内容</span><span>状态</span><span>作者 / 专区</span><span>审核记录</span><span>提交时间</span><span />
            </div>
            <div className="divide-y">
              {filtered.map((post) => {
                const approvalLabel = getApprovalOperatorLabel(post);
                return (
                  <button
                    key={`${post.id}:${post.revisionId ?? post.status}`}
                    type="button"
                    onClick={() => openDetail(post)}
                    className="grid w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.6fr)_90px_minmax(140px,0.8fr)_minmax(160px,1fr)_130px_20px] md:items-center md:gap-4"
                    aria-label={`查看帖子：${post.title}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{post.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        {post.revisionId && <span className="font-medium text-blue-600">已发布帖修改待审</span>}
                        {post.safetyPriority && post.safetyPriority !== "STANDARD" && (
                          <span className={cn(
                            "inline-flex items-center gap-1 font-semibold",
                            post.safetyPriority === "URGENT" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
                          )}>
                            <ShieldAlert className="h-3 w-3" />
                            {post.safetyPriority === "URGENT" ? "安全线索：优先复核" : "安全线索：谨慎复核"}
                          </span>
                        )}
                        {post.tags.slice(0, 2).map((item) => <span key={item.tag.id}>#{item.tag.name}</span>)}
                      </div>
                    </div>
                    <div>
                      <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", STATUS_STYLES[post.status] ?? "bg-muted text-muted-foreground")}>
                        {getModerationStatusLabel(post.status)}
                      </span>
                    </div>
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1 truncate text-foreground"><User className="h-3.5 w-3.5 shrink-0" />{getModerationAuthorLabel(post)}</p>
                      <p className="mt-1 truncate">{getZoneLabel(post.board.zone)} · {post.board.name}</p>
                    </div>
                    <div className="min-w-0 text-xs">
                      {post.status === "PUBLISHED" && approvalLabel ? (
                        <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><BadgeCheck className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{approvalLabel}</span></p>
                      ) : post.status === "PENDING" ? (
                        <span className="text-amber-700 dark:text-amber-400">等待人工审核</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                    <time className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          {selectedPost && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedPost.title}</DialogTitle>
                <DialogDescription>
                  帖子详情 · {selectedPost.board.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Author info */}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {getModerationAuthorLabel(selectedPost)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(selectedPost.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>

                {selectedPost.status === "PUBLISHED" && selectedPost.approvalAudit && (
                  <div className="border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/20">
                    <p className="flex items-center gap-2 font-medium text-green-800 dark:text-green-300">
                      <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                      通过人：{getApprovalOperatorLabel(selectedPost)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      通过时间：{new Date(selectedPost.approvalAudit.createdAt).toLocaleString("zh-CN")}
                      <span className="ml-2">管理员 ID：{selectedPost.approvalAudit.operator.id}</span>
                    </p>
                  </div>
                )}

                {/* Post content */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <SafeMarkdown content={selectedPost.content} className="text-foreground" />
                </div>

                {selectedPost.safetyPriority && selectedPost.safetyPriority !== "STANDARD" && (
                  <div role="alert" className={cn(
                    "border p-4 text-sm",
                    selectedPost.safetyPriority === "URGENT"
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
                  )}>
                    <p className="flex items-center gap-2 font-semibold">
                      <ShieldAlert className="h-4 w-4" />
                      {selectedPost.safetyNotice}
                    </p>
                    <p className="mt-1 text-muted-foreground">此提示不是诊断，也不代替人工判断。若存在即时危险，应先按平台紧急处置流程升级处理，不要仅以删帖代替处置。</p>
                    {selectedPost.status === "PENDING" && selectedPost.safetyPriority === "URGENT" && (
                      <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2 border-t pt-3">
                        <input
                          type="checkbox"
                          checked={safetyAcknowledged}
                          onChange={(event) => setSafetyAcknowledged(event.target.checked)}
                          className="h-4 w-4"
                        />
                        <span>我已完成人工安全复核并确认后续处置</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Tags */}
                {selectedPost.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPost.tags.map((t) => (
                      <span
                        key={t.tag.id}
                        className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                      >
                        #{t.tag.name}
                      </span>
                    ))}
                  </div>
                )}

                <AiReviewPanel
                  targetType={selectedPost.revisionId ? "POST_REVISION" : "POST"}
                  targetId={selectedPost.revisionId || selectedPost.id}
                  onUseReason={setRejectReason}
                />

                {/* Reject reason input (only for PENDING posts) */}
                {selectedPost.status === "PENDING" && (
                  <div className="space-y-2">
                    <Label htmlFor="reject-reason">拒绝原因（拒绝时必填）</Label>
                    <Input
                      id="reject-reason"
                      placeholder="请输入拒绝原因..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                )}
                {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
              </div>

              {/* Action buttons (only for PENDING posts) */}
              {selectedPost.status === "PENDING" && (
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => handleReject(selectedPost.id)}
                    disabled={actionLoading || !rejectReason.trim()}
                    className="min-h-[44px]"
                  >
                    <AlertTriangle className="mr-1.5 h-4 w-4" />
                    拒绝
                  </Button>
                  <Button
                    onClick={() => handleApprove(selectedPost.id)}
                    disabled={actionLoading || (selectedPost.safetyPriority === "URGENT" && !safetyAcknowledged)}
                    className="min-h-[44px]"
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    通过
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
