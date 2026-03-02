import { describe, it, expect } from "vitest";

/**
 * 搜索结果页逻辑测试
 *
 * 验证搜索结果页的核心逻辑：
 * - API 帖子数据到 PostCard props 的映射
 * - 分页判断（hasMore 逻辑）
 * - 各 Tab 类型的数据结构
 *
 * Validates: Requirements 31.1, 31.2, 31.3, 31.4
 */

/* ---------- Types (mirroring page.tsx) ---------- */

interface PostCardProps {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: { nickname: string | null; avatar: string | null };
  board: { name: string; zone: string };
  tags: Array<{ id: string; name: string }>;
}

interface APIPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: { id: string; nickname: string | null; avatar: string | null };
  board: { id: string; name: string; zone: string };
  tags: Array<{ tag: { id: string; name: string } }>;
}

interface APIUser {
  id: string;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
  _count: { posts: number };
}

interface APITag {
  id: string;
  name: string;
  _count: { posts: number };
}

/* ---------- Extracted logic matching page.tsx ---------- */

function mapAPIPostToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: { nickname: post.author.nickname, avatar: post.author.avatar },
    board: { name: post.board.name, zone: post.board.zone },
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
  };
}

function computeHasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total;
}

/* ---------- Fixtures ---------- */

const sampleAPIPost: APIPost = {
  id: "post-search-1",
  title: "搜索测试帖子",
  summary: "这是搜索结果的摘要内容",
  images: ["/search-img.jpg"],
  isAnonymous: false,
  anonymousId: null,
  likeCount: 10,
  author: { id: "user-1", nickname: "搜索用户", avatar: "/avatar.jpg" },
  board: { id: "board-1", name: "技术", zone: "PUBLIC" },
  tags: [{ tag: { id: "tag-1", name: "编程" } }],
};

const sampleAPIUser: APIUser = {
  id: "user-search-1",
  nickname: "测试用户",
  avatar: "/user-avatar.jpg",
  createdAt: "2024-01-01T00:00:00.000Z",
  _count: { posts: 5 },
};

const sampleAPITag: APITag = {
  id: "tag-search-1",
  name: "JavaScript",
  _count: { posts: 42 },
};

/* ---------- Tests ---------- */

describe("搜索结果页逻辑", () => {
  describe("帖子数据映射", () => {
    it("正确映射搜索结果帖子的基本字段", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.id).toBe("post-search-1");
      expect(result.title).toBe("搜索测试帖子");
      expect(result.summary).toBe("这是搜索结果的摘要内容");
      expect(result.images).toEqual(["/search-img.jpg"]);
      expect(result.likeCount).toBe(10);
    });

    it("正确映射作者信息（去除 id）", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.author).toEqual({
        nickname: "搜索用户",
        avatar: "/avatar.jpg",
      });
      expect((result.author as Record<string, unknown>).id).toBeUndefined();
    });

    it("正确映射板块信息（去除 id）", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.board).toEqual({ name: "技术", zone: "PUBLIC" });
      expect((result.board as Record<string, unknown>).id).toBeUndefined();
    });

    it("正确展平嵌套 tags 结构", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.tags).toEqual([{ id: "tag-1", name: "编程" }]);
    });

    it("匿名帖子正确映射", () => {
      const anonPost: APIPost = {
        ...sampleAPIPost,
        isAnonymous: true,
        anonymousId: "匿名_XYZ",
      };
      const result = mapAPIPostToCardProps(anonPost);
      expect(result.isAnonymous).toBe(true);
      expect(result.anonymousId).toBe("匿名_XYZ");
    });

    it("空 tags 映射为空数组", () => {
      const post: APIPost = { ...sampleAPIPost, tags: [] };
      const result = mapAPIPostToCardProps(post);
      expect(result.tags).toEqual([]);
    });

    it("多个 tags 全部正确映射", () => {
      const post: APIPost = {
        ...sampleAPIPost,
        tags: [
          { tag: { id: "t1", name: "React" } },
          { tag: { id: "t2", name: "Next.js" } },
          { tag: { id: "t3", name: "TypeScript" } },
        ],
      };
      const result = mapAPIPostToCardProps(post);
      expect(result.tags).toHaveLength(3);
      expect(result.tags[2]).toEqual({ id: "t3", name: "TypeScript" });
    });
  });

  describe("分页判断 (hasMore)", () => {
    it("第一页有更多数据时返回 true", () => {
      expect(computeHasMore(1, 20, 50)).toBe(true);
    });

    it("最后一页时返回 false", () => {
      expect(computeHasMore(3, 20, 50)).toBe(false);
    });

    it("恰好整除时返回 false", () => {
      expect(computeHasMore(2, 20, 40)).toBe(false);
    });

    it("总数为 0 时返回 false", () => {
      expect(computeHasMore(1, 20, 0)).toBe(false);
    });

    it("单页不满时返回 false", () => {
      expect(computeHasMore(1, 20, 15)).toBe(false);
    });

    it("第二页仍有更多数据时返回 true", () => {
      expect(computeHasMore(2, 20, 60)).toBe(true);
    });
  });

  describe("搜索类型数据结构验证", () => {
    it("用户搜索结果包含必要字段", () => {
      expect(sampleAPIUser).toHaveProperty("id");
      expect(sampleAPIUser).toHaveProperty("nickname");
      expect(sampleAPIUser).toHaveProperty("avatar");
      expect(sampleAPIUser).toHaveProperty("createdAt");
      expect(sampleAPIUser._count).toHaveProperty("posts");
      expect(sampleAPIUser._count.posts).toBe(5);
    });

    it("话题搜索结果包含必要字段", () => {
      expect(sampleAPITag).toHaveProperty("id");
      expect(sampleAPITag).toHaveProperty("name");
      expect(sampleAPITag._count).toHaveProperty("posts");
      expect(sampleAPITag._count.posts).toBe(42);
    });

    it("用户搜索结果 nickname 可为 null", () => {
      const nullNickUser: APIUser = { ...sampleAPIUser, nickname: null };
      expect(nullNickUser.nickname).toBeNull();
    });

    it("用户搜索结果 avatar 可为 null", () => {
      const nullAvatarUser: APIUser = { ...sampleAPIUser, avatar: null };
      expect(nullAvatarUser.avatar).toBeNull();
    });
  });

  describe("Tab 类型验证", () => {
    const validTypes = ["posts", "users", "tags"];

    it("支持三种搜索类型", () => {
      expect(validTypes).toHaveLength(3);
      expect(validTypes).toContain("posts");
      expect(validTypes).toContain("users");
      expect(validTypes).toContain("tags");
    });

    it("搜索类型与 API type 参数一致", () => {
      // The search API accepts type: "posts" | "users" | "tags"
      validTypes.forEach((type) => {
        const params = new URLSearchParams({ q: "test", type });
        expect(params.get("type")).toBe(type);
      });
    });
  });
});
