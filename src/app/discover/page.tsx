"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Hash, LayoutGrid, Star, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CardSkeleton, ListSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

/* ---------- API response types ---------- */

export interface APITag {
  id: string;
  name: string;
  _count: { posts: number };
}

export interface APIBoard {
  id: string;
  name: string;
  description: string | null;
  zone: string;
  _count: { posts: number };
}

export interface APIRecommendationPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: { id: string; nickname: string | null; avatar: string | null };
}

export interface APIRecommendation {
  id: string;
  title: string;
  postId: string | null;
  sortOrder: number;
  isActive: boolean;
  post: APIRecommendationPost | null;
}

/* ---------- Pure helper functions (exported for testing) ---------- */

export function buildTagSearchUrl(tagName: string): string {
  return `/search?q=${encodeURIComponent(tagName)}&type=tags`;
}

export function formatPostCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

export function sortTagsByPostCount(tags: APITag[]): APITag[] {
  return [...tags].sort((a, b) => b._count.posts - a._count.posts);
}

export function filterActiveRecommendations(recs: APIRecommendation[]): APIRecommendation[] {
  return recs.filter((r) => r.isActive);
}

/* ---------- Sub-components ---------- */

function TagCard({ tag }: { tag: APITag }) {
  const href = buildTagSearchUrl(tag.name);
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
      aria-label={`查看话题：${tag.name}，${tag._count.posts} 篇帖子`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
        <Hash className="h-5 w-5 text-primary" />
      </div>
      <span className="text-sm font-medium text-foreground truncate max-w-full">#{tag.name}</span>
      <span className="text-xs text-muted-foreground">{formatPostCount(tag._count.posts)} 篇帖子</span>
    </Link>
  );
}

function BoardCard({ board }: { board: APIBoard }) {
  return (
    <div
      className="flex-shrink-0 w-48 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      role="article"
      aria-label={`板块：${board.name}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary" aria-hidden="true">
          <LayoutGrid className="h-4 w-4 text-secondary-foreground" />
        </div>
        <span className="text-sm font-medium text-foreground truncate">{board.name}</span>
      </div>
      {board.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{board.description}</p>
      )}
      <span className="text-xs text-muted-foreground">{formatPostCount(board._count.posts)} 篇帖子</span>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: APIRecommendation }) {
  const content = (
    <div className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30" aria-hidden="true">
        <Star className="h-5 w-5 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{rec.title}</p>
        {rec.post && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {rec.post.summary ?? rec.post.title}
          </p>
        )}
      </div>
    </div>
  );

  if (rec.post) {
    return (
      <Link
        href={`/post/${rec.post.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
        aria-label={`推荐：${rec.title}`}
      >
        {content}
      </Link>
    );
  }

  return <div aria-label={`推荐：${rec.title}`}>{content}</div>;
}

/* ---------- Main Page ---------- */

export default function DiscoverPage() {
  const [tags, setTags] = useState<APITag[]>([]);
  const [boards, setBoards] = useState<APIBoard[]>([]);
  const [recommendations, setRecommendations] = useState<APIRecommendation[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const res = await fetch("/api/tags?hot=true");
      if (res.ok) {
        const data = await res.json();
        setTags(data.tags ?? []);
      }
    } catch {
      // Network error — silently ignore
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    setLoadingBoards(true);
    try {
      const res = await fetch("/api/boards?hot=true");
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards ?? []);
      }
    } catch {
      // Network error — silently ignore
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    try {
      const res = await fetch("/api/recommendations");
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations ?? []);
      }
    } catch {
      // Network error — silently ignore
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchTags(), fetchBoards(), fetchRecommendations()]);
  }, [fetchTags, fetchBoards, fetchRecommendations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60")}>
        {/* Page header with refresh */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-foreground">发现</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 min-h-[44px] min-w-[44px]"
            aria-label="刷新发现页内容"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            刷新
          </button>
        </div>

        {/* Section 1: 热门话题 */}
        <section className="mb-8" aria-labelledby="hot-topics-heading">
          <h2 id="hot-topics-heading" className="mb-4 text-base font-semibold text-foreground flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" aria-hidden="true" />
            热门话题
          </h2>
          {loadingTags ? (
            <CardSkeleton count={6} className="grid-cols-2 sm:grid-cols-3" />
          ) : tags.length === 0 ? (
            <EmptyState
              title="暂无热门话题"
              description="话题正在酝酿中"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {tags.map((tag) => (
                <TagCard key={tag.id} tag={tag} />
              ))}
            </div>
          )}
        </section>

        {/* Section 2: 热门板块 */}
        <section className="mb-8" aria-labelledby="hot-boards-heading">
          <h2 id="hot-boards-heading" className="mb-4 text-base font-semibold text-foreground flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" aria-hidden="true" />
            热门板块
          </h2>
          {loadingBoards ? (
            <ListSkeleton count={3} />
          ) : boards.length === 0 ? (
            <EmptyState
              title="暂无热门板块"
              description="板块正在建设中"
            />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin" role="list" aria-label="热门板块列表">
              {boards.map((board) => (
                <div key={board.id} role="listitem">
                  <BoardCard board={board} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: 每周推荐 */}
        <section aria-labelledby="weekly-recs-heading">
          <h2 id="weekly-recs-heading" className="mb-4 text-base font-semibold text-foreground flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" aria-hidden="true" />
            每周推荐
          </h2>
          {loadingRecs ? (
            <ListSkeleton count={3} />
          ) : recommendations.length === 0 ? (
            <EmptyState
              title="暂无推荐内容"
              description="编辑正在精选内容"
            />
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
