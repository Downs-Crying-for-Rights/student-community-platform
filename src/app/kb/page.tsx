"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";

/* ========== Constants & Types ========== */

export const KB_CATEGORIES = [
  { value: "ALL", label: "全部" },
  { value: "政策学习", label: "政策学习" },
  { value: "合规渠道", label: "合规渠道" },
  { value: "权益须知", label: "权益须知" },
  { value: "平台指南", label: "平台指南" },
] as const;

export type KBCategoryFilter = (typeof KB_CATEGORIES)[number]["value"];

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

export interface KBArticleListItem {
  id: string;
  title: string;
  category: string;
  visibility: "PUBLIC" | "DCR_ONLY";
  createdAt: string;
  updatedAt: string;
}

/* ========== Pure Functions (exported for testing) ========== */

/**
 * Returns the badge CSS class for a given category.
 */
export function getCategoryBadgeStyle(category: string): string {
  return (
    CATEGORY_BADGE_STYLES[category] ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
  );
}

/**
 * Formats a date string for display in the article list.
 */
export function formatArticleDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Builds the API URL for fetching KB articles with optional category filter and pagination.
 */
export function buildKBApiUrl(
  category: KBCategoryFilter,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();
  if (category !== "ALL") params.set("category", category);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/api/kb?${params.toString()}`;
}

/**
 * Builds the API URL for searching KB articles.
 */
export function buildKBSearchUrl(
  query: string,
  page: number,
  pageSize: number
): string {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/api/kb/search?${params.toString()}`;
}

/* ========== Page Component ========== */

const PAGE_SIZE = 20;

export default function KBListPage() {
  const [category, setCategory] = useState<KBCategoryFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [articles, setArticles] = useState<KBArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isSearching = activeSearch.trim().length > 0;

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = isSearching
        ? buildKBSearchUrl(activeSearch, page, PAGE_SIZE)
        : buildKBApiUrl(category, page, PAGE_SIZE);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles ?? []);
        setTotal(data.total ?? 0);
      } else {
        setError("加载文章列表失败");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [category, page, activeSearch, isSearching]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleCategoryChange = (value: KBCategoryFilter) => {
    setCategory(value);
    setPage(1);
    setActiveSearch("");
    setSearchQuery("");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            知识库
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            政策学习与合规渠道说明
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="搜索文章标题或内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-2xl"
              aria-label="搜索知识库文章"
            />
          </div>
        </form>

        {/* Search active indicator */}
        {isSearching && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              搜索 &quot;{activeSearch}&quot; 的结果（{total} 篇）
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSearch}
              className="h-auto px-2 py-0.5 text-xs"
            >
              清除搜索
            </Button>
          </div>
        )}

        {/* Category Tabs (hidden during search) */}
        {!isSearching && (
          <div
            className="mb-6 flex gap-2 overflow-x-auto"
            role="tablist"
            aria-label="文章分类筛选"
          >
            {KB_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                role="tab"
                aria-selected={category === cat.value}
                onClick={() => handleCategoryChange(cat.value)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  category === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="ml-2 text-sm text-muted-foreground">
              加载中...
            </span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        ) : articles.length === 0 ? (
          <EmptyState
            title={isSearching ? "未找到相关文章" : "暂无文章"}
            description={
              isSearching
                ? "请尝试其他关键词"
                : "知识库暂无文章，请稍后再来"
            }
          />
        ) : (
          <>
            {/* Article Cards */}
            <div className="space-y-3">
              {articles.map((article) => (
                <Link key={article.id} href={`/kb/${article.id}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-medium text-foreground truncate">
                          {article.title}
                        </h2>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryBadgeStyle(article.category)}`}
                          >
                            {article.category}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {formatArticleDate(article.createdAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="下一页"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
