"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/UserAvatar";

export interface PostCardAuthor {
  id: string;
  nickname: string | null;
  avatar: string | null;
  isAdministrator?: boolean;
  isVerified?: boolean;
}

export interface PostCardBoard {
  name: string;
  zone: string;
}

export interface PostCardTag {
  id: string;
  name: string;
}

export interface PostCardProps {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: PostCardAuthor;
  board: PostCardBoard;
  tags: PostCardTag[];
  isPinned?: boolean;
  compact?: boolean;
}

export function PostCard({
  id,
  title,
  summary,
  images,
  isAnonymous,
  anonymousId,
  likeCount,
  author,
  board,
  tags,
  isPinned = false,
  compact = false,
}: PostCardProps) {
  const router = useRouter();
  const coverImage = images.length > 0 ? images[0] : null;
  const displayName = isAnonymous
    ? anonymousId ?? "匿名用户"
    : author.nickname ?? "未命名用户";
  const truncatedSummary =
    summary && summary.length > 60 ? summary.slice(0, 60) + "…" : summary;
  const displayedSummary = compact && coverImage ? summary : truncatedSummary;

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/post/${id}`)}
      onKeyDown={(event) => { if (event.key === "Enter") router.push(`/post/${id}`); }}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl"
      aria-label={`查看帖子：${title}`}
    >
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm",
          "transition-shadow duration-200 group-hover:shadow-md"
        )}
      >
        {/* Cover image */}
        {coverImage ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
            <Image
              src={coverImage}
              alt={`${title} 封面图`}
              fill
              className="object-contain"
              sizes={compact
                ? "(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
                : "(max-width: 768px) 100vw, 50vw"}
            />
          </div>
        ) : (
          <div className={cn(
            "flex aspect-[4/3] w-full items-center justify-center bg-muted",
            compact && "md:h-16 md:aspect-auto",
          )}>
            <span className={cn("text-3xl text-muted-foreground", compact && "md:text-xl")} aria-hidden="true">
              📝
            </span>
          </div>
        )}

        {/* Content area */}
        <div className={cn("p-4", compact && "md:p-3")}>
          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {isPinned && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">置顶</span>}
            {title}
          </h3>

          {/* Summary */}
          {displayedSummary && (
            <p className={cn(
              "mt-1 line-clamp-2 whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground",
              compact && coverImage && "md:line-clamp-none",
            )}>
              {displayedSummary}
            </p>
          )}

          {/* Author row */}
          <div className={cn("mt-3 flex items-center gap-2", compact && "md:mt-2")}>
            {!isAnonymous ? <Link href={`/u/${author.id}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="flex min-w-0 items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`查看 ${displayName} 的主页`}>
            <UserAvatar src={author.avatar} userId={author.id} name={displayName} size={20} administratorVerified={author.isAdministrator} />
            <span className="truncate text-xs text-muted-foreground">
              {displayName}
            </span>
            </Link> : <>
              <UserAvatar name={displayName} size={20} anonymous />
              <span className="truncate text-xs text-muted-foreground">{displayName}</span>
            </>}

            {/* Like count */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
              <span aria-label={`${likeCount} 个点赞`}>{likeCount}</span>
            </div>
          </div>

          {/* Tags + Board zone */}
          {(tags.length > 0 || board.name) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
                >
                  {tag.name}
                </span>
              ))}
              <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {board.name}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
