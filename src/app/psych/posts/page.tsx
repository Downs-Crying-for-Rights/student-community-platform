"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  HeartHandshake,
  Loader2,
  PenLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { PsychLayout } from "@/components/psych/PsychLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

type ApiPost = Omit<PostCardProps, "tags"> & {
  tags: Array<{ tag: { id: string; name: string } }>;
};

interface PsychBoard {
  id: string;
  name: string;
  description: string | null;
  zone: string;
}

export interface PsychPostingGuideline {
  title: string;
  description: string;
}

export function normalizePsychPost(post: ApiPost): PostCardProps {
  return { ...post, tags: post.tags.map(({ tag }) => tag) };
}

export function getPsychPostingGuidelines(): PsychPostingGuideline[] {
  return [
    { title: "倾听而不诊断", description: "分享个人经验，不替他人下诊断或建议停药、改药。" },
    { title: "保护彼此隐私", description: "不要发布真实姓名、学校、住址、联系方式或可识别照片。" },
    { title: "尊重交流边界", description: "不施压私聊、交换联系方式或线下见面，发现不适及时举报。" },
    { title: "危险情况优先求助", description: "存在即时伤害风险时，联系可信成人并拨打 110、120 或 12356。" },
  ];
}

export function buildPsychPostsUrl(options: {
  page: number;
  boardId: string;
  sort: "latest" | "popular";
}): string {
  const params = new URLSearchParams({
    zone: "PSYCHOLOGY",
    page: String(options.page),
    pageSize: String(PAGE_SIZE),
    sort: options.sort,
  });
  if (options.boardId) params.set("boardId", options.boardId);
  return `/api/posts?${params.toString()}`;
}

export default function PsychPostsPage() {
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [boards, setBoards] = useState<PsychBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/boards", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { boards: [] })
      .then((data) => {
        if (!cancelled) {
          setBoards((data.boards ?? []).filter((board: PsychBoard) => board.zone === "PSYCHOLOGY"));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadPosts = useCallback(async (nextPage: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setPosts([]);
    }
    setError(null);
    try {
      const response = await fetch(
        buildPsychPostsUrl({ page: nextPage, boardId: selectedBoard, sort }),
        { cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "帖子加载失败");
      if (requestId !== requestIdRef.current) return;
      const nextPosts = (data.posts ?? []).map(normalizePsychPost);
      setPosts((current) => append ? [...current, ...nextPosts] : nextPosts);
      setTotal(typeof data.total === "number" ? data.total : nextPosts.length);
      setPage(nextPage);
    } catch (reason) {
      if (requestId !== requestIdRef.current) return;
      setError(reason instanceof Error ? reason.message : "帖子加载失败");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [selectedBoard, sort]);

  useEffect(() => {
    void loadPosts(1, false);
  }, [loadPosts]);

  const guidelines = getPsychPostingGuidelines();
  const hasMore = posts.length < total;

  return (
    <PsychLayout>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/psych" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              返回心理区
            </Link>
            <h1 className="text-2xl font-bold">心理区匿名交流</h1>
            <p className="mt-1 text-sm text-muted-foreground">仅心理区成员可见，发帖和作者身份均按匿名方式展示。</p>
          </div>
          <Button asChild className="min-h-[44px] shrink-0 bg-orange-600 text-white hover:bg-orange-700">
            <Link href="/create?zone=PSYCHOLOGY">
              <PenLine className="mr-2 h-4 w-4" />
              发布内容
            </Link>
          </Button>
        </div>

        <section aria-labelledby="psych-guidelines-title" className="mb-6 border-y bg-background/70 py-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-rose-600" aria-hidden="true" />
            <h2 id="psych-guidelines-title" className="font-semibold">同伴支持边界</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {guidelines.map((guideline) => (
              <div key={guideline.title} className="flex gap-2 text-sm">
                <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p><span className="font-medium text-foreground">{guideline.title}：</span><span className="text-muted-foreground">{guideline.description}</span></p>
              </div>
            ))}
          </div>
        </section>

        <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label="按心理区板块筛选">
            <Button
              type="button"
              variant={selectedBoard === "" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setSelectedBoard("")}
            >
              全部
            </Button>
            {boards.map((board) => (
              <Button
                key={board.id}
                type="button"
                variant={selectedBoard === board.id ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => setSelectedBoard(board.id)}
                title={board.description ?? undefined}
              >
                {board.name}
              </Button>
            ))}
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as "latest" | "popular")}>
            <SelectTrigger className="w-full sm:w-32" aria-label="帖子排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">最新发布</SelectItem>
              <SelectItem value="popular">较多支持</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div role="status" className="flex min-h-40 items-center justify-center border-y text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在加载匿名交流内容...
          </div>
        )}

        {!loading && error && posts.length === 0 && (
          <div role="alert" className="border-y border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void loadPosts(1, false)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="border-y p-8 text-center text-muted-foreground">当前筛选下还没有已发布内容。</div>
        )}

        {!loading && posts.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => <PostCard key={post.id} {...post} />)}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={() => void loadPosts(page + 1, true)}
                  className="min-h-[44px]"
                >
                  {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  继续加载
                </Button>
              ) : (
                <p className={cn("text-xs text-muted-foreground", posts.length === 0 && "hidden")}>已显示全部 {total} 条内容</p>
              )}
            </div>
          </>
        )}
      </main>
    </PsychLayout>
  );
}
