"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { WaterfallGrid } from "@/components/feed/WaterfallGrid";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { cn } from "@/lib/utils";

type SortMode = "latest" | "popular";

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

/**
 * Build query params for fetching DCR posts.
 * Uses caseIds to filter posts by associated cases instead of zone=DCR.
 */
export function buildPostsQueryParams(
  caseIds: string[],
  sort: SortMode,
  pageNum: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams({
    caseIds: caseIds.join(","),
    sort,
    page: String(pageNum),
    pageSize: String(pageSize),
  });
  return params;
}

function mapToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: { nickname: post.author.nickname, avatar: post.author.avatar },
    board: { name: post.board.name, zone: post.board.zone },
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
  };
}

export default function DCRPostsPage() {
  const [sort, setSort] = useState<SortMode>("latest");
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [caseIds, setCaseIds] = useState<string[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch user's participating case IDs first
  useEffect(() => {
    async function fetchCaseIds() {
      try {
        const res = await fetch("/api/cases?pageSize=200");
        if (!res.ok) {
          setCaseIds([]);
          return;
        }
        const data = await res.json();
        const ids: string[] = (data.cases ?? []).map((c: { id: string }) => c.id);
        setCaseIds(ids);
      } catch {
        setCaseIds([]);
      }
    }
    fetchCaseIds();
  }, []);

  const fetchPosts = useCallback(
    async (pageNum: number, currentSort: SortMode, append: boolean, ids: string[]) => {
      if (ids.length === 0) {
        // No cases → no posts to show
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          caseIds: ids.join(","),
          sort: currentSort,
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
        });
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) return;

        const data: PostsResponse = await res.json();
        const mapped = data.posts.map(mapToCardProps);

        setPosts((prev) => (append ? [...prev, ...mapped] : mapped));
        setHasMore(data.page * data.pageSize < data.total);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (caseIds === null) return; // still loading case IDs
    setPosts([]);
    setPage(1);
    setHasMore(true);
    fetchPosts(1, sort, false, caseIds);
  }, [sort, fetchPosts, caseIds]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || caseIds === null) return;

    const currentCaseIds = caseIds;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((prev) => {
            const next = prev + 1;
            fetchPosts(next, sort, true, currentCaseIds);
            return next;
          });
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, sort, fetchPosts, caseIds]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <Sidebar />

      <main className={cn("mx-auto max-w-screen-xl px-4 pb-24 pt-4 lg:ml-60")}>
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-lg font-bold text-foreground">DCR 区帖子</h1>
        </div>

        <div className="mb-4">
          <PrivacyBanner />
        </div>

        {/* Sort tabs */}
        <div className="mb-4 flex gap-2" role="tablist" aria-label="帖子排序">
          {(["latest", "popular"] as const).map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={sort === mode}
              onClick={() => sort !== mode && setSort(mode)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                "min-h-[44px] min-w-[44px]",
                sort === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {mode === "latest" ? "最新" : "热门"}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <CardSkeleton count={6} />
        ) : posts.length === 0 ? (
          <EmptyState
            title="暂无帖子"
            description="DCR 区还没有帖子，快来发布第一篇吧"
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

            {loadingMore && (
              <div className="mt-4">
                <CardSkeleton count={2} />
              </div>
            )}

            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

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
