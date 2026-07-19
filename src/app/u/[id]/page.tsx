"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { User, CalendarDays, MessageCircle, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PostCard, type PostCardProps } from "@/components/feed/PostCard";
import { WaterfallGrid } from "@/components/feed/WaterfallGrid";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/shared/ReportDialog";
import { useDMConsent } from "@/components/dm/DMConsentDialog";

/* ---------- Types ---------- */

export interface ProfileUser {
  id: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  createdAt: string;
  _count?: {
    posts: number;
    likes: number;
  };
}

export interface ProfilePost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  createdAt: string;
  author: { id: string; nickname: string | null; avatar: string | null };
  board: { id: string; name: string; zone: string };
  tags: { tag: { id: string; name: string } }[];
}

/* ---------- Helpers (exported for testing) ---------- */

export function formatJoinDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function mapPostToCardProps(post: ProfilePost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: {
      id: post.author.id,
      nickname: post.author.nickname,
      avatar: post.author.avatar,
    },
    board: {
      name: post.board.name,
      zone: post.board.zone,
    },
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
  };
}

export type ProfileTab = "posts" | "bookmarks" | "likes";

export function getVisibleTabs(isOwnProfile: boolean): ProfileTab[] {
  if (isOwnProfile) return ["posts", "bookmarks", "likes"];
  return ["posts"];
}

export const TAB_LABELS: Record<ProfileTab, string> = {
  posts: "发帖",
  bookmarks: "收藏",
  likes: "点赞",
};

/* ---------- PostGrid sub-component ---------- */

function PostGrid({
  posts,
  loading,
  emptyMessage,
}: {
  posts: ProfilePost[];
  loading: boolean;
  emptyMessage: string;
}) {
  if (loading) return <CardSkeleton count={4} />;
  if (posts.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        description="这里还没有内容"
        actionLabel="去发现"
        actionHref="/discover"
      />
    );
  }
  return (
    <WaterfallGrid>
      {posts.map((post) => (
        <PostCard key={post.id} {...mapPostToCardProps(post)} />
      ))}
    </WaterfallGrid>
  );
}

/* ---------- Main Page ---------- */

export default function ProfilePage() {
  const { ensureConsent, dialog: dmConsentDialog } = useDMConsent();
  const params = useParams();
  const router = useRouter();
  const rawId = params.id as string;
  const { data: session } = useSession();
  // Resolve "me" to the actual user ID
  const profileId = rawId === "me" ? (session?.user?.id ?? rawId) : rawId;
  const isOwnProfile = rawId === "me" || session?.user?.id === profileId;

  const [user, setUser] = useState<ProfileUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [bookmarks, setBookmarks] = useState<ProfilePost[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);

  const [likes, setLikes] = useState<ProfilePost[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [startingDM, setStartingDM] = useState(false);
  const [dmError, setDmError] = useState("");
  const bookmarksFetched = useRef(false);
  const likesFetched = useRef(false);

  const visibleTabs = getVisibleTabs(isOwnProfile);

  // Fetch user profile
  const fetchUser = useCallback(async () => {
    setUserLoading(true);
    try {
      const res = await fetch(`/api/users/${profileId}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // silently ignore
    } finally {
      setUserLoading(false);
    }
  }, [profileId]);

  // Fetch user's posts
  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/posts?authorId=${profileId}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setPostsLoading(false);
    }
  }, [profileId]);

  // Fetch bookmarked posts (own profile only)
  const fetchBookmarks = useCallback(async () => {
    if (!isOwnProfile) return;
    setBookmarksLoading(true);
    try {
      const res = await fetch(`/api/posts?bookmarkedBy=${profileId}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data.posts ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setBookmarksLoading(false);
    }
  }, [profileId, isOwnProfile]);

  // Fetch liked posts (own profile only)
  const fetchLikes = useCallback(async () => {
    if (!isOwnProfile) return;
    setLikesLoading(true);
    try {
      const res = await fetch(`/api/posts?likedBy=${profileId}&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setLikes(data.posts ?? []);
      }
    } catch {
      // silently ignore
    } finally {
      setLikesLoading(false);
    }
  }, [profileId, isOwnProfile]);

  useEffect(() => {
    fetchUser();
    fetchPosts();
  }, [fetchUser, fetchPosts]);

  // Lazy-load bookmarks/likes when tab is first activated
  useEffect(() => {
    if (activeTab === "bookmarks" && !bookmarksFetched.current) {
      bookmarksFetched.current = true;
      fetchBookmarks();
    }
    if (activeTab === "likes" && !likesFetched.current) {
      likesFetched.current = true;
      fetchLikes();
    }
  }, [activeTab, fetchBookmarks, fetchLikes]);

  const startDirectMessage = async () => {
    if (!user || isOwnProfile || startingDM) return;
    setStartingDM(true);
    setDmError("");
    try {
      const response = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: user.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDmError(data.error || "无法发起私信");
        return;
      }
      router.push(`/messages/dm/${data.thread.id}`);
    } catch {
      setDmError("网络错误，请稍后重试");
    } finally {
      setStartingDM(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">

      <main className={cn("mx-auto max-w-screen-md px-4 pb-24 pt-4")}>
        {/* Profile Header */}
        {userLoading ? (
          <div className="mb-6 flex flex-col items-center gap-3 py-8">
            <div className="h-20 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
        ) : user ? (
          <div className="mb-6 flex flex-col items-center gap-3 py-8">
            {user.avatar ? (
              <Image
                src={user.avatar}
                alt={`${user.nickname ?? "用户"} 头像`}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full bg-muted"
                aria-label="默认头像"
              >
                <User className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-xl font-bold text-foreground">
              {user.nickname ?? "未命名用户"}
            </h1>
            {user.bio && (
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {user.bio}
              </p>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{formatJoinDate(user.createdAt)} 加入</span>
            </div>
            {!isOwnProfile && session?.user?.id && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => void ensureConsent(startDirectMessage)} disabled={startingDM}>
                  {startingDM ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  发私信
                </Button>
                <ReportDialog target={{ targetUserId: user.id }} label="举报用户" />
              </div>
            )}
            {dmError && <p className="text-sm text-destructive" role="alert">{dmError}</p>}
          </div>
        ) : (
          <EmptyState title="用户不存在" description="该用户可能已被删除" />
        )}

        {/* Tabs */}
        {user && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ProfileTab)}
          >
            <TabsList className="mb-4 w-full">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="flex-1">
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="posts">
              <PostGrid
                posts={posts}
                loading={postsLoading}
                emptyMessage="暂无帖子"
              />
            </TabsContent>

            {isOwnProfile && (
              <>
                <TabsContent value="bookmarks">
                  <PostGrid
                    posts={bookmarks}
                    loading={bookmarksLoading}
                    emptyMessage="暂无收藏"
                  />
                </TabsContent>

                <TabsContent value="likes">
                  <PostGrid
                    posts={likes}
                    loading={likesLoading}
                    emptyMessage="暂无点赞"
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </main>

      {dmConsentDialog}
    </div>
  );
}
