"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Heart, Bookmark, MessageCircle, Share2, User, Trash2, Loader2, Clock } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { ImageCarousel } from "@/components/post/ImageCarousel";
import { CommentDrawer } from "@/components/comment/CommentDrawer";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";

interface PostAuthor {
  id: string;
  nickname: string | null;
  avatar: string | null;
}

interface PostBoard {
  id: string;
  name: string;
  zone: string;
}

interface PostTag {
  tag: { id: string; name: string };
}

interface PostData {
  id: string;
  title: string;
  content: string;
  images: string[];
  status: string;
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: PostAuthor;
  board: PostBoard;
  tags: PostTag[];
}

function PostDetailSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
      <div className="space-y-3">
        <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = params.id;
  const router = useRouter();
  const { data: session } = useSession();

  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    async function fetchPost() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/posts/${postId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "加载失败");
          return;
        }
        const data = await res.json();
        setPost(data.post);
        setLikeCount(data.post.likeCount);
      } catch {
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [postId]);

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      }
    } catch {
      // silently fail
    } finally {
      setLikeLoading(false);
    }
  }, [postId, likeLoading]);

  const handleBookmark = useCallback(async () => {
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
      }
    } catch {
      // silently fail
    } finally {
      setBookmarkLoading(false);
    }
  }, [postId, bookmarkLoading]);

  const handleShare = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: post?.title ?? "帖子分享",
        url: window.location.href,
      }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }, [post?.title]);

  const isAuthor = Boolean(session?.user?.id && post?.author.id === session.user.id);

  const handleDelete = useCallback(async () => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "删除失败，请稍后重试");
        return;
      }
      setDeleteDialogOpen(false);
      router.push("/");
    } catch {
      alert("网络错误，请检查连接后重试");
    } finally {
      setDeleteLoading(false);
    }
  }, [postId, deleteLoading, router]);

  const showPrivacyBanner =
    post?.board.zone === "PSYCHOLOGY" || post?.board.zone === "DCR";

  const displayName = post
    ? post.isAnonymous
      ? post.anonymousId ?? "匿名用户"
      : post.author.nickname ?? "未命名用户"
    : "";

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar />

      {loading ? (
        <PostDetailSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
          <p className="text-muted-foreground">{error}</p>
        </div>
      ) : post ? (
        <>
          <div className="mx-auto max-w-2xl">
            {/* Privacy Banner for PSYCHOLOGY / DCR zones */}
            {showPrivacyBanner && (
              <div className="px-4 pt-4">
                <PrivacyBanner />
              </div>
            )}

            {/* Pending moderation banner — only visible to author */}
            {post.status === "PENDING" && isAuthor && (
              <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-200">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>帖子正在等待审核，通过后将对其他用户可见</span>
              </div>
            )}

            {/* Image Carousel */}
            {post.images.length > 0 && (
              <div className="px-4 pt-4">
                <ImageCarousel images={post.images} alt={post.title} />
              </div>
            )}

            {/* Content area */}
            <div className="px-4 pt-4">
              <h1 className="text-xl font-bold leading-tight text-foreground">
                {post.title}
              </h1>

              <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                {post.content}
              </div>

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {post.tags.map((t) => (
                    <span
                      key={t.tag.id}
                      className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                    >
                      #{t.tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Author info card */}
              <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                {post.isAnonymous || !post.author.avatar ? (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                ) : (
                  <Image
                    src={post.author.avatar}
                    alt={`${displayName} 头像`}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(post.createdAt)}
                  </p>
                </div>
                <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                  {post.board.name}
                </span>
              </div>
            </div>
          </div>

          {/* Fixed bottom action bar */}
          <div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-40",
              "border-t border-border/40 bg-background/95 backdrop-blur-md",
              "supports-[backdrop-filter]:bg-background/80"
            )}
          >
            <div className="mx-auto flex h-14 max-w-2xl items-center justify-around px-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                disabled={likeLoading}
                className={cn(
                  "min-h-[44px] min-w-[44px] gap-1.5",
                  liked && "text-red-500"
                )}
                aria-label={liked ? "取消点赞" : "点赞"}
              >
                <Heart
                  className={cn("h-5 w-5", liked && "fill-current")}
                />
                <span className="text-xs">{likeCount}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleBookmark}
                disabled={bookmarkLoading}
                className={cn(
                  "min-h-[44px] min-w-[44px] gap-1.5",
                  bookmarked && "text-yellow-500"
                )}
                aria-label={bookmarked ? "取消收藏" : "收藏"}
              >
                <Bookmark
                  className={cn("h-5 w-5", bookmarked && "fill-current")}
                />
                <span className="text-xs">{bookmarked ? "已收藏" : "收藏"}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCommentOpen(true)}
                className="min-h-[44px] min-w-[44px] gap-1.5"
                aria-label="评论"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="text-xs">{post.commentCount}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleShare}
                className="min-h-[44px] min-w-[44px] gap-1.5"
                aria-label="分享"
              >
                <Share2 className="h-5 w-5" />
                <span className="text-xs">分享</span>
              </Button>

              {isAuthor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="min-h-[44px] min-w-[44px] gap-1.5 text-destructive hover:text-destructive"
                  aria-label="删除帖子"
                >
                  <Trash2 className="h-5 w-5" />
                  <span className="text-xs">删除</span>
                </Button>
              )}
            </div>
          </div>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认删除</DialogTitle>
                <DialogDescription>
                  删除后帖子将无法恢复，确定要删除这篇帖子吗？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleteLoading}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                >
                  {deleteLoading && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  确认删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Comment Drawer */}
          <CommentDrawer
            postId={postId}
            open={commentOpen}
            onOpenChange={setCommentOpen}
          />
        </>
      ) : null}
    </div>
  );
}
