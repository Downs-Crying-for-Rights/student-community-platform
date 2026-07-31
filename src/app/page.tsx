"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WaterfallGrid } from "@/components/feed/WaterfallGrid";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import Link from "next/link";
import { BookOpen, Lightbulb, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_HOME_HERO, isHomeHeroConfig, type HomeHeroConfig } from "@/lib/home-content-config";

type SortMode = "popular" | "latest";

interface APIPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  isPinned: boolean;
  author: { id: string; nickname: string | null; avatar: string | null; isAdministrator?: boolean; isVerified?: boolean };
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
export const HOME_GRID_CLASS = "md:columns-3 md:gap-3 md:[&>*]:mb-3 xl:columns-4";

function mapAPIPostToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    isPinned: post.isPinned,
    author: {
      id: post.author.id,
      nickname: post.author.nickname,
      avatar: post.author.avatar,
      isAdministrator: post.author.isAdministrator,
      isVerified: post.author.isVerified,
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
  const [error, setError] = useState<string | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [hero, setHero] = useState<HomeHeroConfig>(DEFAULT_HOME_HERO);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const postRequestRef = useRef(0);

  const fetchPosts = useCallback(
    async (pageNum: number, currentSort: SortMode, append: boolean) => {
      const requestId = ++postRequestRef.current;
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
        if (!res.ok) {
          if (requestId === postRequestRef.current) {
            setError("帖子加载失败，请稍后重试");
            setFailedPage(pageNum);
          }
          return false;
        }

        const data: PostsResponse = await res.json();
        const mapped = data.posts.map(mapAPIPostToCardProps);

        if (requestId !== postRequestRef.current) return;
        setError(null);
        setFailedPage(null);
        setPosts((prev) => (append ? [...prev, ...mapped] : mapped));
        setHasMore(data.page * data.pageSize < data.total);
        setPage(pageNum);
        return true;
      } catch {
        if (requestId === postRequestRef.current) {
          setError("网络错误，请检查连接后重试");
          setFailedPage(pageNum);
        }
        return false;
      } finally {
        if (requestId === postRequestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Initial load & sort change
  useEffect(() => {
    setPosts([]);
    setPage(1);
    setHasMore(true);
    setError(null);
    setFailedPage(null);
    void fetchPosts(1, sort, false);
  }, [sort, fetchPosts]);

  useEffect(() => {
    fetch("/api/home-content", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (isHomeHeroConfig(data.hero)) setHero(data.hero);
      })
      .catch(() => {});
  }, []);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && !error) {
          void fetchPosts(page + 1, sort, true);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loading, loadingMore, page, sort, fetchPosts]);

  function handleSortChange(newSort: SortMode) {
    if (newSort !== sort) {
      postRequestRef.current += 1;
      setSort(newSort);
    }
  }

  return (
    <div className="min-h-screen bg-background">

      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4")}>
        {/* 电子扫盲精选 Banner */}
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 p-5 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-cyan-950/20 border border-indigo-100 dark:border-indigo-800/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-bold text-indigo-700 dark:text-indigo-300">{hero.title}</h2>
          </div>
          <p className="text-sm text-indigo-600/80 dark:text-indigo-400/80 mb-3">
            {hero.description}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={hero.links[0].href}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-800/40 dark:text-indigo-300 dark:hover:bg-indigo-800/60 transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              {hero.links[0].label}
            </Link>
            <Link
              href={hero.links[1].href}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-800/40 dark:text-blue-300 dark:hover:bg-blue-800/60 transition-colors"
            >
              <Lightbulb className="h-3 w-3" />
              {hero.links[1].label}
            </Link>
            <Link
              href={hero.links[2].href}
              className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-800/40 dark:text-cyan-300 dark:hover:bg-cyan-800/60 transition-colors"
            >
              {hero.links[2].label}
            </Link>
          </div>
        </div>

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
        {error && posts.length === 0 ? (
          <div role="alert" aria-live="polite" className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => void fetchPosts(failedPage ?? 1, sort, false)}
              className="mt-3 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              重试
            </button>
          </div>
        ) : loading ? (
          <CardSkeleton count={8} className="md:grid-cols-3 xl:grid-cols-4 md:gap-3" />
        ) : posts.length === 0 ? (
          <EmptyState
            title="暂无帖子"
            description="还没有人发帖，快来成为第一个吧！"
            actionLabel="去发帖"
            actionHref="/create"
          />
        ) : (
          <>
            <WaterfallGrid className={HOME_GRID_CLASS}>
              {posts.map((post) => (
                <PostCard key={post.id} {...post} compact />
              ))}
            </WaterfallGrid>

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="mt-4">
                <CardSkeleton count={2} />
              </div>
            )}

            {error && failedPage && (
              <div role="alert" className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={() => void fetchPosts(failedPage, sort, true)} className="mt-2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground">重试加载第 {failedPage} 页</button>
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

    </div>
  );
}
