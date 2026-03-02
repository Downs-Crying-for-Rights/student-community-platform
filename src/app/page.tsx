"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { WaterfallGrid } from "@/components/feed/WaterfallGrid";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

type SortMode = "popular" | "latest";

interface APIPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: { id: string; nickname: string | null; avatar: string | null };
  board: { id: string; name: string; zone: string };
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface PostsResponse {
  posts: APIPost[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

function mapAPIPostToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: {
      nickname: post.author.nickname,
      avatar: post.author.avatar,
    },
    board: {
      name: post.board.name,
      zone: post.board.zone,
    },
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
  };
}

export default function HomePage() {
  const [sort, setSort] = useState<SortMode>("popular");
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(
    async (pageNum: number, currentSort: SortMode, append: boolean) => {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams({
          sort: currentSort,
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) return;

        const data: PostsResponse = await res.json();
        const mapped = data.posts.map(mapAPIPostToCardProps);

        setPosts((prev) => (append ? [...prev, ...mapped] : mapped));
        setHasMore(data.page * data.pageSize < data.total);
      } catch {
        // Network error — silently ignore for now
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  // Initial load & sort change
  useEffect(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
    fetchPosts(1, sort, false);
  }, [sort, fetchPosts]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((prev) => {
            const next = prev + 1;
            fetchPosts(next, sort, true);
            return next;
          });
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, sort, fetchPosts]);

  function handleSortChange(newSort: SortMode) {
    if (newSort !== sort) {
      setSort(newSort);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60")}>
        {/* Tabs */}
        <div className="mb-4 flex gap-2" role="tablist" aria-label="帖子排序">
          <button
            role="tab"
            aria-selected={sort === "popular"}
            onClick={() => handleSortChange("popular")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              "min-h-[44px] min-w-[44px]",
              sort === "popular"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            综合推荐
          </button>
          <button
            role="tab"
            aria-selected={sort === "latest"}
            onClick={() => handleSortChange("latest")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              "min-h-[44px] min-w-[44px]",
              sort === "latest"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            最新
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <CardSkeleton count={6} />
        ) : posts.length === 0 ? (
          <EmptyState
            title="暂无帖子"
            description="还没有人发帖，快来成为第一个吧！"
            actionLabel="去发帖"
            actionHref="/create"
          />
        ) : (
          <>
            <WaterfallGrid>
              {posts.map((post) => (
                <PostCard key={post.id} {...post} />
              ))}
            </WaterfallGrid>

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="mt-4">
                <CardSkeleton count={2} />
              </div>
            )}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

            {/* End of list */}
            {!hasMore && posts.length > 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                已经到底啦 ~
              </p>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
