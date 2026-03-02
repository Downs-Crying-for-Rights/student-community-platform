"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Calendar, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/* ========== Types ========== */

export interface KBArticleDetail {
  id: string;
  title: string;
  content: string;
  category: string;
  visibility: "PUBLIC" | "DCR_ONLY";
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ========== Pure Functions (exported for testing) ========== */

export const CATEGORY_BADGE_STYLES: Record<string, string> = {
  政策学习:
    "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  合规渠道:
    "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200",
  权益须知:
    "bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  平台指南:
    "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
};

/**
 * Returns the badge CSS class for a given category.
 */
export function getDetailCategoryBadgeStyle(category: string): string {
  return (
    CATEGORY_BADGE_STYLES[category] ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
  );
}

/**
 * Formats a date string for the article detail page.
 */
export function formatDetailDate(dateStr: string): string {
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

/**
 * Returns a visibility label for display.
 */
export function getVisibilityLabel(
  visibility: string
): { label: string; className: string } {
  if (visibility === "DCR_ONLY") {
    return {
      label: "DCR 专属",
      className:
        "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    };
  }
  return {
    label: "公开",
    className:
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  };
}

/* ========== Page Component ========== */

export default function KBArticleDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [article, setArticle] = useState<KBArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchArticle = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/kb/${id}`);
        if (res.ok) {
          const data = await res.json();
          setArticle(data.article ?? null);
        } else if (res.status === 404) {
          setError("文章不存在");
        } else if (res.status === 403) {
          setError("无权限查看此文章");
        } else {
          setError("加载文章失败");
        }
      } catch {
        setError("网络错误，请检查连接后重试");
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="ml-2 text-sm text-muted-foreground">
              加载中...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error ?? "文章数据加载失败"}
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild className="rounded-2xl">
              <Link href="/kb">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                返回知识库
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visibilityInfo = getVisibilityLabel(article.visibility);

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back button */}
        <div className="mb-6">
          <Button variant="outline" asChild className="rounded-2xl" size="sm">
            <Link href="/kb">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回知识库
            </Link>
          </Button>
        </div>

        {/* Article */}
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-foreground">
              {article.title}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getDetailCategoryBadgeStyle(article.category)}`}
              >
                <Tag className="h-3 w-3" aria-hidden="true" />
                {article.category}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${visibilityInfo.className}`}
              >
                {visibilityInfo.label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" aria-hidden="true" />
                {formatDetailDate(article.createdAt)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground leading-relaxed">
              {article.content}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
