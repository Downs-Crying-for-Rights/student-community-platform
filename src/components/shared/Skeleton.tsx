import { cn } from "@/lib/utils";

interface CardSkeletonProps {
  className?: string;
}

/** Single card skeleton mimicking PostCard shape */
function CardSkeletonItem({ className }: CardSkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      {/* Image placeholder */}
      <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
      <div className="p-4 space-y-3">
        {/* Title line */}
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        {/* Text lines */}
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
        {/* Author row */}
        <div className="flex items-center gap-2 pt-1">
          <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export interface SkeletonProps {
  count?: number;
  className?: string;
}

/** Card skeleton grid — renders `count` PostCard-shaped placeholders */
export function CardSkeleton({ count = 4, className }: SkeletonProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeletonItem key={i} />
      ))}
    </div>
  );
}

/** List skeleton — renders `count` rows of content placeholders */
export function ListSkeleton({ count = 5, className }: SkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border bg-card p-4"
        >
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
