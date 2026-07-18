"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PenLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { PsychLayout } from "@/components/psych/PsychLayout";

type ApiPost = Omit<PostCardProps, "tags"> & { tags: Array<{ tag: { id: string; name: string } }> };
export function normalizePsychPost(post: ApiPost): PostCardProps {
  return { ...post, tags: post.tags.map(({ tag }) => tag) };
}

export default function PsychPostsPage() {
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadPosts = () => {
    setLoading(true); setError(null);
    fetch("/api/posts?zone=PSYCHOLOGY", { cache: "no-store" })
      .then(async (response) => { const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error || "帖子加载失败"); return data; })
      .then((data) => setPosts((data.posts ?? []).map(normalizePsychPost)))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "帖子加载失败"))
      .finally(() => setLoading(false));
  };
  useEffect(loadPosts, []);
  return <PsychLayout><main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
    <div className="mb-6 flex items-center justify-between gap-3"><div><Link href="/psych" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />返回心理区</Link><h1 className="text-2xl font-bold">心理区匿名树洞</h1><p className="mt-1 text-sm text-muted-foreground">仅心理区成员可见，请不要发布 PII。</p></div><Button asChild className="shrink-0 rounded-full bg-orange-600 text-white hover:bg-orange-700"><Link href="/create?zone=PSYCHOLOGY"><PenLine className="mr-2 h-4 w-4" />发布</Link></Button></div>
    {loading && <div role="status" className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">正在加载匿名树洞...</div>}
    {!loading && error && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" className="mt-4" onClick={loadPosts}><RefreshCw className="mr-2 h-4 w-4" />重试</Button></div>}
    {!loading && !error && posts.length === 0 && <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">这里还没有公开的心理区帖子。</div>}
    {!loading && !error && posts.length > 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{posts.map((post) => <PostCard key={post.id} {...post} />)}</div>}
  </main></PsychLayout>;
}
