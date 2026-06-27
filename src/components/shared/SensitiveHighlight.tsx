"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Types ====================

export interface SensitiveMatch {
  word: string;
  category: string;
  startIndex: number;
  endIndex: number;
}

export interface HighlightSegment {
  text: string;
  isSensitive: boolean;
  /** Original match info, present only for sensitive segments */
  match?: SensitiveMatch;
}

export interface SensitiveHighlightProps {
  /** The full text to render */
  text: string;
  /** Sensitive word matches from scanContent */
  matches: SensitiveMatch[];
  /** Optional CSS class for the wrapper */
  className?: string;
  /** Whether to show inline modification hints next to each match (default: true) */
  showHints?: boolean;
}

// ==================== Helpers ====================

/** Category labels for user-facing hints */
const CATEGORY_HINTS: Record<string, string> = {
  PII: "请移除个人信息",
  RISK: "请修改风险内容",
  PHISHING: "请移除诱导内容",
  PROFANITY: "请修改不当用语",
};

export function getCategoryHint(category: string): string {
  return CATEGORY_HINTS[category] ?? "请修改此内容";
}

/**
 * Build segments from text and matches, splitting into sensitive / non-sensitive parts.
 * Each sensitive segment carries its original match metadata.
 */
export function buildSegments(
  text: string,
  matches: SensitiveMatch[],
): HighlightSegment[] {
  if (!matches.length) return [{ text, isSensitive: false }];

  const sorted = [...matches].sort((a, b) => a.startIndex - b.startIndex);
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of sorted) {
    // Skip overlapping matches
    if (match.startIndex < cursor) continue;

    if (match.startIndex > cursor) {
      segments.push({
        text: text.slice(cursor, match.startIndex),
        isSensitive: false,
      });
    }
    segments.push({
      text: text.slice(match.startIndex, match.endIndex),
      isSensitive: true,
      match,
    });
    cursor = match.endIndex;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isSensitive: false });
  }

  return segments;
}

// ==================== Component ====================

export function SensitiveHighlight({
  text,
  matches,
  className,
  showHints = true,
}: SensitiveHighlightProps) {
  if (!text) return null;

  const segments = buildSegments(text, matches);

  return (
    <div
      className={cn("text-sm leading-relaxed", className)}
      role="region"
      aria-label="敏感词高亮预览"
    >
      {segments.map((seg, i) =>
        seg.isSensitive ? (
          <span key={i} className="inline-flex items-center gap-0.5">
            <mark className="rounded bg-destructive/20 px-0.5 text-destructive">
              [已隐藏]
            </mark>
            {showHints && seg.match && (
              <span
                className="inline-flex items-center gap-0.5 text-xs text-destructive/80"
                aria-label={`修改提示: ${getCategoryHint(seg.match.category)}`}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <span>{getCategoryHint(seg.match.category)}</span>
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </div>
  );
}
