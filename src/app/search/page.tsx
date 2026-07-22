"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Hash } from "lucide-react";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { WaterfallGrid } from "@/components/feed/WaterfallGrid";
import { CardSkeleton, ListSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/UserAvatar";

type SearchType = "posts" | "users" | "tags";

const PAGE_SIZE = 20;

/* ---------- API response types ---------- */

interface APIPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: { id: string; nickname: string | null; avatar: string | null; isVerified?: boolean };
  board: { id: string; name: string; zone: string };
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface APIUser {
  id: string;
  nickname: string | null;
  avatar: string | null;
  isVerified?: boolean;
  createdAt: string;
  _count: { posts: number };
}

interface APITag {
  id: string;
  name: string;
  _count: { posts: number };
}

interface SearchResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- Helpers ---------- */

export function mapAPIPostToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: { id: post.author.id, nickname: post.author.nickname, avatar: post.author.avatar, isVerified: post.author.isVerified },
    board: { name: post.board.name, zone: post.board.zone },
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
  };
}

export function computeHasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total;
}

/* ---------- Sub-components ---------- */

function UserResultItem({ user }: { user: APIUser }) {
  const displayName = user.nickname ?? "未命名用户";
  return (
    <Link
      href={`/u/${user.id}`}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`查看用户：${displayName}`}
    >
      <UserAvatar src={user.avatar} name={displayName} size={40} isVerified={user.isVerified} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        <p className="text-xs text-muted-foreground">{user._count.posts} 篇帖子</p>
      </div>
    </Link>
  );
}

function TagResultItem({ tag }: { tag: APITag }) {
  return (
    <Link
      href={`/search?q=${encodeURIComponent(tag.name)}&type=posts`}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`查看话题：${tag.name}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
        <Hash className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">#{tag.name}</p>
        <p className="text-xs text-muted-foreground">{tag._count.posts} 篇帖子</p>
      </div>
    </Link>
  );
}

/* ---------- Main Page ---------- */

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4")}>
          <CardSkeleton count={4} />
        </main>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const [activeTab, setActiveTab] = useState<SearchType>("posts");
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [users, setUsers] = useState<APIUser[]>([]);
  const [tags, setTags] = useState<APITag[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const fetchResults = useCallback(
    async (type: SearchType, q: string, pageNum: number, append: boolean) => {
      if (!q.trim()) return;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q,
          type,
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (requestId === requestRef.current) setError(data.error || "搜索失败，请稍后重试");
          return;
        }
        if (requestId !== requestRef.current) return;

        if (type === "posts") {
          const data: SearchResponse<APIPost> = await res.json();
          const mapped = data.results.map(mapAPIPostToCardProps);
          setPosts((prev) => (append ? [...prev, ...mapped] : mapped));
          setTotal(data.total);
          setHasMore(computeHasMore(data.page, data.pageSize, data.total));
        } else if (type === "users") {
          const data: SearchResponse<APIUser> = await res.json();
          setUsers((prev) => (append ? [...prev, ...data.results] : data.results));
          setTotal(data.total);
          setHasMore(computeHasMore(data.page, data.pageSize, data.total));
        } else {
          const data: SearchResponse<APITag> = await res.json();
          setTags((prev) => (append ? [...prev, ...data.results] : data.results));
          setTotal(data.total);
          setHasMore(computeHasMore(data.page, data.pageSize, data.total));
        }
      } catch {
        if (requestId === requestRef.current) setError("网络错误，请检查连接后重试");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [],
  );

  // Fetch when query or tab changes
  useEffect(() => {
    setPosts([]);
    setUsers([]);
    setTags([]);
    setPage(1);
    setTotal(0);
    setHasMore(false);
    fetchResults(activeTab, query, 1, false);
  }, [query, activeTab, fetchResults]);

  function handleLoadMore() {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchResults(activeTab, query, nextPage, true);
  }

  function handleTabChange(value: string) {
    setActiveTab(value as SearchType);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4")}>
        {/* Search query heading */}
        {query && (
          <h1 className="mb-4 text-lg font-semibold text-foreground">
            搜索：{query}
          </h1>
        )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"><p>{error}</p><button className="mt-2 underline" onClick={() => fetchResults(activeTab, query, 1, false)}>重试</button></div>}
          <TabsList className="mb-4" aria-label="搜索类型">
            <TabsTrigger value="posts" className="min-h-[44px] min-w-[44px]">
              帖子
            </TabsTrigger>
            <TabsTrigger value="users" className="min-h-[44px] min-w-[44px]">
              用户
            </TabsTrigger>
            <TabsTrigger value="tags" className="min-h-[44px] min-w-[44px]">
              话题
            </TabsTrigger>
          </TabsList>

          {/* Posts tab */}
          <TabsContent value="posts">
            {loading && posts.length === 0 ? (
              <CardSkeleton count={4} />
            ) : posts.length === 0 ? (
              <EmptyState
                title="未找到相关帖子"
                description="换个关键词试试吧"
                actionLabel="去发现"
                actionHref="/discover"
              />
            ) : (
              <>
                <WaterfallGrid>
                  {posts.map((post) => (
                    <PostCard key={post.id} {...post} />
                  ))}
                </WaterfallGrid>
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="rounded-full bg-secondary px-6 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 min-h-[44px]"
                    >
                      {loading ? "加载中…" : "加载更多"}
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Users tab */}
          <TabsContent value="users">
            {loading && users.length === 0 ? (
              <ListSkeleton count={4} />
            ) : users.length === 0 ? (
              <EmptyState
                title="未找到相关用户"
                description="换个关键词试试吧"
              />
            ) : (
              <>
                <div className="space-y-3">
                  {users.map((user) => (
                    <UserResultItem key={user.id} user={user} />
                  ))}
                </div>
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="rounded-full bg-secondary px-6 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 min-h-[44px]"
                    >
                      {loading ? "加载中…" : "加载更多"}
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tags tab */}
          <TabsContent value="tags">
            {loading && tags.length === 0 ? (
              <ListSkeleton count={4} />
            ) : tags.length === 0 ? (
              <EmptyState
                title="未找到相关话题"
                description="换个关键词试试吧"
              />
            ) : (
              <>
                <div className="space-y-3">
                  {tags.map((tag) => (
                    <TagResultItem key={tag.id} tag={tag} />
                  ))}
                </div>
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="rounded-full bg-secondary px-6 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 min-h-[44px]"
                    >
                      {loading ? "加载中…" : "加载更多"}
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Total count */}
        {!loading && total > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            共 {total} 条结果
          </p>
        )}
      </main>
    </div>
  );
}
