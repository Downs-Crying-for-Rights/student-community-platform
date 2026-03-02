"use client";

import { cn } from "@/lib/utils";

/* ========== Types ========== */

export interface TimelineEvent {
  id: string;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  details: string | null;
  createdAt: string;
  caseId: string;
}

/* ========== Pure Functions (exported for testing) ========== */

/**
 * Returns a color class for the timeline dot based on the new status.
 */
export function getStatusDotColor(newStatus: string | null): string {
  switch (newStatus) {
    case "OPENED":
      return "bg-amber-400";
    case "IN_PROGRESS":
      return "bg-blue-500";
    case "NEED_MORE_INFO":
      return "bg-orange-400";
    case "CLOSED":
      return "bg-slate-400";
    default:
      return "bg-slate-300";
  }
}

/**
 * Formats a date string into a human-readable locale string.
 */
export function formatTimelineDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/* ========== Component ========== */

export interface TimelineViewProps {
  events: TimelineEvent[];
  className?: string;
}

export function TimelineView({ events, className }: TimelineViewProps) {
  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        暂无时间线记录
      </p>
    );
  }

  return (
    <div className={cn("relative", className)} role="list" aria-label="工单时间线">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const dotColor = getStatusDotColor(event.newStatus);

        return (
          <div key={event.id} className="relative flex gap-4 pb-6" role="listitem">
            {/* Dot + connecting line */}
            <div className="flex flex-col items-center">
              <div
                className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", dotColor)}
                aria-hidden="true"
              />
              {!isLast && (
                <div
                  className="w-0.5 flex-1 bg-muted-foreground/20"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-1">
              <p className="text-sm font-medium text-foreground">
                {event.action}
              </p>
              {event.details && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.details}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground/70">
                {formatTimelineDate(event.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
