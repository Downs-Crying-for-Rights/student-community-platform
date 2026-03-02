"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PostCardAuthor {
  nickname: string | null;
  avatar: string | null;
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
}: PostCardProps) {
  const coverImage = images.length > 0 ? images[0] : null;
  const displayName = isAnonymous
    ? anonymousId ?? "匿名用户"
    : author.nickname ?? "未命名用户";
  const truncatedSummary =
    summary && summary.length > 60 ? summary.slice(0, 60) + "…" : summary;

  return (
    <Link
      href={`/post/${id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl"
      aria-label={`查看帖子：${title}`}
    >
      <article
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
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted">
            <span className="text-3xl text-muted-foreground" aria-hidden="true">
              📝
            </span>
          </div>
        )}

        {/* Content area */}
        <div className="p-4">
          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {title}
          </h3>

          {/* Summary */}
          {truncatedSummary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {truncatedSummary}
            </p>
          )}

          {/* Author row */}
          <div className="mt-3 flex items-center gap-2">
            {isAnonymous || !author.avatar ? (
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted"
                aria-hidden="true"
              >
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
            ) : (
              <Image
                src={author.avatar}
                alt={`${displayName} 头像`}
                width={20}
                height={20}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
              />
            )}
            <span className="truncate text-xs text-muted-foreground">
              {displayName}
            </span>

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
      </article>
    </Link>
  );
}
