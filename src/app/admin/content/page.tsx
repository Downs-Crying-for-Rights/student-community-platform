"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

// ==================== Types ====================

interface PostItem {
  id: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  author: { id: string; nickname: string | null; email: string | null };
  board: { id: string; name: string };
}

interface CommentItem {
  id: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  author: { id: string; nickname: string | null; email: string | null };
  post: { id: string; title: string };
}

type Tab = "posts" | "comments";

const POST_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "DELETED"] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  PUBLISHED: "已发布",
  REJECTED: "已拒绝",
  DELETED: "已删除",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  PUBLISHED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  DELETED: "bg-red-200 text-red-800",
};

export default function AdminContentPage() {
  const [tab, setTab] = useState<Tab>("posts");

  // Posts state
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);
  const [postsStatus, setPostsStatus] = useState("");
  const [postsSearch, setPostsSearch] = useState("");
  const [postsSearchInput, setPostsSearchInput] = useState("");
  const [postsLoading, setPostsLoading] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsTotalPages, setCommentsTotalPages] = useState(1);
  const [commentsDeleted, setCommentsDeleted] = useState("");
  const [commentsSearch, setCommentsSearch] = useState("");
  const [commentsSearchInput, setCommentsSearchInput] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  // ==================== Fetch Posts ====================

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(postsPage), pageSize: "20" });
      if (postsStatus) params.set("status", postsStatus);
      if (postsSearch) params.set("search", postsSearch);

      const res = await fetch(`/api/admin/posts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
        setPostsTotal(data.total);
        setPostsTotalPages(data.totalPages);
      }
    } finally {
      setPostsLoading(false);
    }
  }, [postsPage, postsStatus, postsSearch]);

  useEffect(() => {
    if (tab === "posts") fetchPosts();
  }, [tab, fetchPosts]);

  // ==================== Fetch Comments ====================

  const fetchComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(commentsPage), pageSize: "20" });
      if (commentsDeleted) params.set("deleted", commentsDeleted);
      if (commentsSearch) params.set("search", commentsSearch);

      const res = await fetch(`/api/admin/comments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
        setCommentsTotal(data.total);
        setCommentsTotalPages(data.totalPages);
      }
    } finally {
      setCommentsLoading(false);
    }
  }, [commentsPage, commentsDeleted, commentsSearch]);

  useEffect(() => {
    if (tab === "comments") fetchComments();
  }, [tab, fetchComments]);

  // ==================== Actions ====================

  const handlePostStatusChange = async (postId: string, status: string) => {
    const res = await fetch(`/api/admin/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchPosts();
  };

  const handleCommentToggle = async (commentId: string, isDeleted: boolean) => {
    const res = await fetch(`/api/admin/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDeleted }),
    });
    if (res.ok) fetchComments();
  };

  // ==================== Render ====================

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">内容管理</h1>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === "posts" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("posts")}
        >
          帖子管理
        </Button>
        <Button
          variant={tab === "comments" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("comments")}
        >
          评论管理
        </Button>
      </div>

      {/* Posts Tab */}
      {tab === "posts" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">筛选条件</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <select
                aria-label="按状态筛选"
                className="border rounded px-3 py-2 text-sm"
                value={postsStatus}
                onChange={(e) => { setPostsStatus(e.target.value); setPostsPage(1); }}
              >
                <option value="">全部状态</option>
                {POST_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setPostsSearch(postsSearchInput); setPostsPage(1); }}
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索标题或内容..."
                    value={postsSearchInput}
                    onChange={(e) => setPostsSearchInput(e.target.value)}
                    className="pl-8 h-9 w-60"
                    aria-label="搜索帖子"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">搜索</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {postsLoading ? (
                <div className="p-8 text-center text-muted-foreground">加载中...</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3">标题</th>
                          <th className="text-left p-3">作者</th>
                          <th className="text-left p-3">板块</th>
                          <th className="text-left p-3">状态</th>
                          <th className="text-left p-3">发布时间</th>
                          <th className="text-left p-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posts.map((post) => (
                          <tr key={post.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 max-w-[200px]">
                              <a
                                href={`/post/${post.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:underline line-clamp-1"
                              >
                                {post.title}
                              </a>
                            </td>
                            <td className="p-3 text-xs">
                              {post.author.nickname || post.author.email || "匿名"}
                            </td>
                            <td className="p-3 text-xs">{post.board.name}</td>
                            <td className="p-3">
                              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[post.status] || ""}`}>
                                {STATUS_LABELS[post.status] || post.status}
                              </span>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                            </td>
                            <td className="p-3">
                              <select
                                aria-label={`变更帖子状态: ${post.title}`}
                                className="border rounded px-2 py-1 text-xs"
                                value={post.status}
                                onChange={(e) => handlePostStatusChange(post.id, e.target.value)}
                              >
                                {POST_STATUSES.map((s) => (
                                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                        {posts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">暂无数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <span className="text-sm text-muted-foreground">共 {postsTotal} 条帖子</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={postsPage <= 1} onClick={() => setPostsPage((p) => p - 1)}>上一页</Button>
                      <span className="text-sm py-1 px-2">{postsPage} / {postsTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={postsPage >= postsTotalPages} onClick={() => setPostsPage((p) => p + 1)}>下一页</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Comments Tab */}
      {tab === "comments" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">筛选条件</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <select
                aria-label="按删除状态筛选"
                className="border rounded px-3 py-2 text-sm"
                value={commentsDeleted}
                onChange={(e) => { setCommentsDeleted(e.target.value); setCommentsPage(1); }}
              >
                <option value="">全部</option>
                <option value="false">正常</option>
                <option value="true">已删除</option>
              </select>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setCommentsSearch(commentsSearchInput); setCommentsPage(1); }}
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索评论内容..."
                    value={commentsSearchInput}
                    onChange={(e) => setCommentsSearchInput(e.target.value)}
                    className="pl-8 h-9 w-60"
                    aria-label="搜索评论"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">搜索</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {commentsLoading ? (
                <div className="p-8 text-center text-muted-foreground">加载中...</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" role="table">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3">评论内容</th>
                          <th className="text-left p-3">作者</th>
                          <th className="text-left p-3">所属帖子</th>
                          <th className="text-left p-3">状态</th>
                          <th className="text-left p-3">时间</th>
                          <th className="text-left p-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comments.map((comment) => (
                          <tr key={comment.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 max-w-[250px]">
                              <span className="line-clamp-2 text-xs">{comment.content}</span>
                            </td>
                            <td className="p-3 text-xs">
                              {comment.author.nickname || comment.author.email || "匿名"}
                            </td>
                            <td className="p-3 text-xs max-w-[150px]">
                              <a
                                href={`/post/${comment.post.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline line-clamp-1"
                              >
                                {comment.post.title}
                              </a>
                            </td>
                            <td className="p-3">
                              {comment.isDeleted ? (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">已删除</span>
                              ) : (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">正常</span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(comment.createdAt).toLocaleDateString("zh-CN")}
                            </td>
                            <td className="p-3">
                              {comment.isDeleted ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleCommentToggle(comment.id, false)}
                                >
                                  恢复
                                </Button>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => handleCommentToggle(comment.id, true)}
                                >
                                  删除
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {comments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">暂无数据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <span className="text-sm text-muted-foreground">共 {commentsTotal} 条评论</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={commentsPage <= 1} onClick={() => setCommentsPage((p) => p - 1)}>上一页</Button>
                      <span className="text-sm py-1 px-2">{commentsPage} / {commentsTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={commentsPage >= commentsTotalPages} onClick={() => setCommentsPage((p) => p + 1)}>下一页</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
