"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Tiny 1x1 transparent blurred placeholder for progressive loading */
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAJpAN42sJxJAAAAABJRU5ErkJggg==";

export interface ImageCarouselProps {
  images: string[];
  alt?: string;
  className?: string;
}

export function ImageCarousel({
  images,
  alt = "图片",
  className,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const total = images.length;
  const showControls = total > 1;

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
  }, [total]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!showControls) return;
      setTouchStartX(e.touches[0].clientX);
    },
    [showControls]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX === null || !showControls) return;
      const diff = touchStartX - e.changedTouches[0].clientX;
      const SWIPE_THRESHOLD = 50;
      if (diff > SWIPE_THRESHOLD) {
        goToNext();
      } else if (diff < -SWIPE_THRESHOLD) {
        goToPrev();
      }
      setTouchStartX(null);
    },
    [touchStartX, showControls, goToNext, goToPrev]
  );

  if (total === 0) return null;

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-2xl", className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-label={`${alt} 轮播，共 ${total} 张`}
      aria-roledescription="carousel"
    >
      {/* Image track */}
      <div
        className="flex transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {images.map((src, idx) => (
          <div
            key={src + idx}
            className="relative aspect-square w-full flex-shrink-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`${alt} ${idx + 1}/${total}`}
          >
            <Image
              src={src}
              alt={`${alt} ${idx + 1}`}
              fill
              className="object-cover"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              sizes="(max-width: 768px) 100vw, 672px"
              priority={idx === 0}
            />
          </div>
        ))}
      </div>

      {/* Left arrow */}
      {showControls && currentIndex > 0 && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute left-2 top-1/2 z-10 min-h-[44px] min-w-[44px] -translate-y-1/2 rounded-full bg-black/40 text-white shadow-md hover:bg-black/60"
          onClick={goToPrev}
          aria-label="上一张图片"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}

      {/* Right arrow */}
      {showControls && currentIndex < total - 1 && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-1/2 z-10 min-h-[44px] min-w-[44px] -translate-y-1/2 rounded-full bg-black/40 text-white shadow-md hover:bg-black/60"
          onClick={goToNext}
          aria-label="下一张图片"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}

      {/* Counter + dot indicators */}
      {showControls && (
        <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-1.5">
          {/* Counter text */}
          <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-medium text-white">
            {formatCounter(currentIndex, total)}
          </span>
          {/* Dot indicators */}
          <div className="flex gap-1.5" role="tablist" aria-label="图片指示器">
            {images.map((_, idx) => (
              <button
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentIndex
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/50"
                )}
                onClick={() => setCurrentIndex(idx)}
                role="tab"
                aria-selected={idx === currentIndex}
                aria-label={`跳转到第 ${idx + 1} 张图片`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Format counter text like "1/5" */
export function formatCounter(currentIndex: number, total: number): string {
  return `${currentIndex + 1}/${total}`;
}

/** Determine if navigation controls should be visible */
export function shouldShowControls(imageCount: number): boolean {
  return imageCount > 1;
}

/** Clamp navigation index within valid bounds */
export function clampIndex(
  index: number,
  total: number
): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}
