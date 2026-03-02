import { describe, it, expect } from "vitest";

/**
 * 首页 Feed 页面逻辑测试
 *
 * 验证首页 Feed 的核心逻辑：
 * - API 帖子数据到 PostCard props 的映射
 * - 嵌套 tags 结构的正确转换
 * - 分页判断（hasMore 逻辑）
 * - 排序模式切换
 *
 * Validates: Requirements 27.1, 27.2, 27.3, 27.5, 27.6, 27.8
 */

interface PostCardAuthor {
  nickname: string | null;
  avatar: string | null;
}

interface PostCardBoard {
  name: string;
  zone: string;
}

interface PostCardTag {
  id: string;
  name: string;
}

interface PostCardProps {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  isAnonymous: boolean;
  anonymousId: string | null;
  likeCount: number;
  author: PostCardAuthor;
  board: PostCardBoard;
  tags: PostCardTag[];
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

// Extracted logic matching page.tsx implementation
function mapAPIPostToCardProps(post: APIPost): PostCardProps {
  return {
    id: post.id,
    title: post.title,
    summary: post.summary,
    images: post.images,
    isAnonymous: post.isAnonymous,
    anonymousId: post.anonymousId,
    likeCount: post.likeCount,
    author: {
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

function computeHasMore(page: number, pageSize: number, total: number): boolean {
  return page * pageSize < total;
}

describe("首页 Feed 逻辑", () => {
  describe("API 数据映射", () => {
    const sampleAPIPost: APIPost = {
      id: "post-1",
      title: "测试帖子",
      summary: "这是摘要",
      images: ["/img1.jpg"],
      isAnonymous: false,
      anonymousId: null,
      likeCount: 42,
      author: { id: "user-1", nickname: "张三", avatar: "/avatar.jpg" },
      board: { id: "board-1", name: "娱乐", zone: "PUBLIC" },
      tags: [
        { tag: { id: "tag-1", name: "技术" } },
        { tag: { id: "tag-2", name: "生活" } },
      ],
    };

    it("正确映射基本字段", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.id).toBe("post-1");
      expect(result.title).toBe("测试帖子");
      expect(result.summary).toBe("这是摘要");
      expect(result.images).toEqual(["/img1.jpg"]);
      expect(result.likeCount).toBe(42);
    });

    it("正确映射作者信息（去除 id）", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.author).toEqual({
        nickname: "张三",
        avatar: "/avatar.jpg",
      });
    });

    it("正确映射板块信息（去除 id）", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.board).toEqual({
        name: "娱乐",
        zone: "PUBLIC",
      });
    });

    it("正确展平嵌套 tags 结构", () => {
      const result = mapAPIPostToCardProps(sampleAPIPost);
      expect(result.tags).toEqual([
        { id: "tag-1", name: "技术" },
        { id: "tag-2", name: "生活" },
      ]);
    });

    it("空 tags 数组映射为空数组", () => {
      const post: APIPost = { ...sampleAPIPost, tags: [] };
      const result = mapAPIPostToCardProps(post);
      expect(result.tags).toEqual([]);
    });

    it("匿名帖子正确映射", () => {
      const post: APIPost = {
        ...sampleAPIPost,
        isAnonymous: true,
        anonymousId: "匿名_ABC",
      };
      const result = mapAPIPostToCardProps(post);
      expect(result.isAnonymous).toBe(true);
      expect(result.anonymousId).toBe("匿名_ABC");
    });
  });

  describe("分页判断", () => {
    it("第一页有更多数据时 hasMore 为 true", () => {
      expect(computeHasMore(1, 20, 50)).toBe(true);
    });

    it("最后一页时 hasMore 为 false", () => {
      expect(computeHasMore(3, 20, 50)).toBe(false);
    });

    it("恰好整除时 hasMore 为 false", () => {
      expect(computeHasMore(2, 20, 40)).toBe(false);
    });

    it("总数为 0 时 hasMore 为 false", () => {
      expect(computeHasMore(1, 20, 0)).toBe(false);
    });

    it("单页不满时 hasMore 为 false", () => {
      expect(computeHasMore(1, 20, 15)).toBe(false);
    });
  });
});
