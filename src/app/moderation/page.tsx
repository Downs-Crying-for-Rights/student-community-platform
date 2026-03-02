"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Shield, FileText, AlertTriangle, User, Filter } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState } from "@/components/shared/EmptyState";
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
}

export interface BoardOption {
  id: string;
  name: string;
  zone: string;
}

export type KanbanColumn = "PENDING" | "IN_REVIEW" | "PUBLISHED" | "REJECTED";

export const COLUMN_CONFIG: Record<
  KanbanColumn,
  { label: string; color: string; bgColor: string }
> = {
  PENDING: { label: "待审核", color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950/30" },
  IN_REVIEW: { label: "审核中", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  PUBLISHED: { label: "已通过", color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950/30" },
  REJECTED: { label: "已拒绝", color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30" },
};

/** Map API post status to kanban column */
export function mapStatusToColumn(status: string): KanbanColumn {
  switch (status) {
    case "PUBLISHED":
      return "PUBLISHED";
    case "REJECTED":
      return "REJECTED";
    case "PENDING":
    default:
      return "PENDING";
  }
}

/** Group posts into kanban columns */
export function groupPostsByColumn(
  posts: ModerationPost[]
): Record<KanbanColumn, ModerationPost[]> {
  const groups: Record<KanbanColumn, ModerationPost[]> = {
    PENDING: [],
    IN_REVIEW: [],
    PUBLISHED: [],
    REJECTED: [],
  };
  for (const post of posts) {
    const col = mapStatusToColumn(post.status);
    groups[col].push(post);
  }
  return groups;
}

/** Filter posts by content type and board */
export function filterPosts(
  posts: ModerationPost[],
  filterBoard: string
): ModerationPost[] {
  if (!filterBoard) return posts;
  return posts.filter((p) => p.board.id === filterBoard);
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
  const [filterBoard, setFilterBoard] = useState("");
  const [selectedPost, setSelectedPost] = useState<ModerationPost | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch posts across all statuses for the kanban view
      const statuses = ["PENDING", "PUBLISHED", "REJECTED"];
      const results = await Promise.all(
        statuses.map((status) =>
          fetch(`/api/posts?status=${status}&pageSize=50`).then((r) =>
            r.ok ? r.json() : { posts: [] }
          )
        )
      );
      const allPosts: ModerationPost[] = results.flatMap((r) => r.posts ?? []);
      setPosts(allPosts);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/boards");
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards ?? []);
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
        <TopBar />
        <Sidebar />
        <main className="mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60">
          <ListSkeleton count={4} />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!canAccessModeration(userRole)) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <Sidebar />
        <main className="mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60">
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
        <BottomNav />
      </div>
    );
  }

  const filtered = filterPosts(posts, filterBoard);
  const grouped = groupPostsByColumn(filtered);

  async function handleApprove(postId: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/moderation/${postId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setDialogOpen(false);
        setSelectedPost(null);
        await fetchPosts();
      }
    } catch {
      // silently ignore
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(postId: string) {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/moderation/${postId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setSelectedPost(null);
        setRejectReason("");
        await fetchPosts();
      }
    } catch {
      // silently ignore
    } finally {
      setActionLoading(false);
    }
  }

  function openDetail(post: ModerationPost) {
    setSelectedPost(post);
    setRejectReason("");
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60")}>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Shield className="h-6 w-6" aria-hidden="true" />
            审核看板
          </h1>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <select
              value={filterBoard}
              onChange={(e) => setFilterBoard(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="按板块筛选"
            >
              <option value="">全部板块</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Kanban Board */}
        {loading ? (
          <ListSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(COLUMN_CONFIG) as KanbanColumn[]).map((col) => {
              const config = COLUMN_CONFIG[col];
              const columnPosts = grouped[col];
              return (
                <div key={col} className={cn("rounded-2xl p-3", config.bgColor)}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className={cn("text-sm font-semibold", config.color)}>
                      {config.label}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        config.color
                      )}
                    >
                      {columnPosts.length}
                    </span>
                  </div>

                  {columnPosts.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      暂无内容
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {columnPosts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => openDetail(post)}
                          className="w-full text-left"
                          aria-label={`查看帖子：${post.title}`}
                        >
                          <Card className="cursor-pointer transition-shadow hover:shadow-md">
                            <CardContent className="p-3">
                              <p className="line-clamp-2 text-sm font-medium text-foreground">
                                {post.title}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <User className="h-3 w-3" aria-hidden="true" />
                                <span>{post.author.nickname ?? "匿名用户"}</span>
                                <span>·</span>
                                <span>{post.board.name}</span>
                              </div>
                              {post.tags.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {post.tags.slice(0, 3).map((t) => (
                                    <span
                                      key={t.tag.id}
                                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                      {t.tag.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
                      {selectedPost.author.nickname ?? "匿名用户"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(selectedPost.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>

                {/* Post content */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedPost.content}
                  </p>
                </div>

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
                    disabled={actionLoading}
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

      <BottomNav />
    </div>
  );
}
