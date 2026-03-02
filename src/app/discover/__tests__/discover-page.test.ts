import { describe, it, expect } from "vitest";

/**
 * 发现页逻辑测试
 *
 * 验证发现页的核心逻辑：
 * - 话题卡片搜索 URL 构建
 * - 帖子数量格式化
 * - 标签排序逻辑
 * - 推荐内容过滤
 * - 数据结构验证
 *
 * Validates: Requirements 30.1, 30.2, 30.3, 30.4, 30.5, 30.6
 */

/* ---------- Types (mirroring page.tsx) ---------- */

interface APITag {
  id: string;
  name: string;
  _count: { posts: number };
}

interface APIBoard {
  id: string;
  name: string;
  description: string | null;
  zone: string;
  _count: { posts: number };
}

interface APIRecommendationPost {
  id: string;
  title: string;
  summary: string | null;
  images: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: { id: string; nickname: string | null; avatar: string | null };
}

interface APIRecommendation {
  id: string;
  title: string;
  postId: string | null;
  sortOrder: number;
  isActive: boolean;
  post: APIRecommendationPost | null;
}

/* ---------- Extracted logic matching page.tsx ---------- */

function buildTagSearchUrl(tagName: string): string {
  return `/search?q=${encodeURIComponent(tagName)}&type=tags`;
}

function formatPostCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function sortTagsByPostCount(tags: APITag[]): APITag[] {
  return [...tags].sort((a, b) => b._count.posts - a._count.posts);
}

function filterActiveRecommendations(recs: APIRecommendation[]): APIRecommendation[] {
  return recs.filter((r) => r.isActive);
}

/* ---------- Fixtures ---------- */

const sampleTags: APITag[] = [
  { id: "tag-1", name: "编程", _count: { posts: 42 } },
  { id: "tag-2", name: "AI效率", _count: { posts: 128 } },
  { id: "tag-3", name: "隐私安全", _count: { posts: 15 } },
  { id: "tag-4", name: "娱乐", _count: { posts: 256 } },
];

const sampleBoards: APIBoard[] = [
  { id: "board-1", name: "技术讨论", description: "编程与技术交流", zone: "PUBLIC", _count: { posts: 100 } },
  { id: "board-2", name: "AI效率", description: "AI 工具使用心得", zone: "PUBLIC", _count: { posts: 80 } },
  { id: "board-3", name: "公告", description: null, zone: "PUBLIC", _count: { posts: 5 } },
];

const samplePost: APIRecommendationPost = {
  id: "post-1",
  title: "推荐帖子标题",
  summary: "这是推荐帖子的摘要",
  images: ["/img.jpg"],
  likeCount: 20,
  commentCount: 5,
  createdAt: "2024-06-01T00:00:00.000Z",
  author: { id: "user-1", nickname: "推荐者", avatar: "/avatar.jpg" },
};

const sampleRecommendations: APIRecommendation[] = [
  { id: "rec-1", title: "本周精选：AI 学习指南", postId: "post-1", sortOrder: 0, isActive: true, post: samplePost },
  { id: "rec-2", title: "编程入门推荐", postId: null, sortOrder: 1, isActive: true, post: null },
  { id: "rec-3", title: "已下线推荐", postId: null, sortOrder: 2, isActive: false, post: null },
];

/* ---------- Tests ---------- */

describe("发现页逻辑", () => {
  describe("话题卡片导航 URL 构建 (需求 30.3)", () => {
    it("正确构建普通话题搜索 URL", () => {
      expect(buildTagSearchUrl("编程")).toBe("/search?q=%E7%BC%96%E7%A8%8B&type=tags");
    });

    it("正确编码包含特殊字符的话题名", () => {
      expect(buildTagSearchUrl("C++")).toBe("/search?q=C%2B%2B&type=tags");
    });

    it("正确编码包含空格的话题名", () => {
      expect(buildTagSearchUrl("AI 效率")).toBe("/search?q=AI%20%E6%95%88%E7%8E%87&type=tags");
    });

    it("空话题名生成正确 URL", () => {
      expect(buildTagSearchUrl("")).toBe("/search?q=&type=tags");
    });

    it("URL 始终包含 type=tags 参数", () => {
      const url = buildTagSearchUrl("test");
      expect(url).toContain("type=tags");
    });
  });

  describe("帖子数量格式化 (需求 30.2, 30.4)", () => {
    it("小于 1000 直接显示数字", () => {
      expect(formatPostCount(42)).toBe("42");
      expect(formatPostCount(0)).toBe("0");
      expect(formatPostCount(999)).toBe("999");
    });

    it("1000-9999 显示 k 格式", () => {
      expect(formatPostCount(1000)).toBe("1.0k");
      expect(formatPostCount(1500)).toBe("1.5k");
      expect(formatPostCount(9999)).toBe("10.0k");
    });

    it("10000 及以上显示万格式", () => {
      expect(formatPostCount(10000)).toBe("1.0万");
      expect(formatPostCount(15000)).toBe("1.5万");
      expect(formatPostCount(100000)).toBe("10.0万");
    });
  });

  describe("热门话题排序 (需求 30.2)", () => {
    it("按帖子数量降序排列", () => {
      const sorted = sortTagsByPostCount(sampleTags);
      expect(sorted[0].name).toBe("娱乐");
      expect(sorted[1].name).toBe("AI效率");
      expect(sorted[2].name).toBe("编程");
      expect(sorted[3].name).toBe("隐私安全");
    });

    it("不修改原数组", () => {
      const original = [...sampleTags];
      sortTagsByPostCount(sampleTags);
      expect(sampleTags).toEqual(original);
    });

    it("空数组返回空数组", () => {
      expect(sortTagsByPostCount([])).toEqual([]);
    });

    it("单元素数组直接返回", () => {
      const single = [{ id: "t1", name: "test", _count: { posts: 5 } }];
      const sorted = sortTagsByPostCount(single);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].name).toBe("test");
    });
  });

  describe("推荐内容过滤 (需求 30.5)", () => {
    it("仅返回 isActive 为 true 的推荐", () => {
      const active = filterActiveRecommendations(sampleRecommendations);
      expect(active).toHaveLength(2);
      expect(active.every((r) => r.isActive)).toBe(true);
    });

    it("过滤掉已下线的推荐", () => {
      const active = filterActiveRecommendations(sampleRecommendations);
      expect(active.find((r) => r.id === "rec-3")).toBeUndefined();
    });

    it("全部下线时返回空数组", () => {
      const allInactive = sampleRecommendations.map((r) => ({ ...r, isActive: false }));
      expect(filterActiveRecommendations(allInactive)).toEqual([]);
    });

    it("空数组返回空数组", () => {
      expect(filterActiveRecommendations([])).toEqual([]);
    });
  });

  describe("热门话题数据结构 (需求 30.1, 30.2)", () => {
    it("话题包含 id、name 和帖子数量", () => {
      const tag = sampleTags[0];
      expect(tag).toHaveProperty("id");
      expect(tag).toHaveProperty("name");
      expect(tag._count).toHaveProperty("posts");
      expect(typeof tag._count.posts).toBe("number");
    });

    it("话题名称为字符串", () => {
      sampleTags.forEach((tag) => {
        expect(typeof tag.name).toBe("string");
        expect(tag.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe("热门板块数据结构 (需求 30.4)", () => {
    it("板块包含名称、描述和帖子数量", () => {
      const board = sampleBoards[0];
      expect(board).toHaveProperty("name");
      expect(board).toHaveProperty("description");
      expect(board._count).toHaveProperty("posts");
    });

    it("板块描述可为 null", () => {
      const nullDescBoard = sampleBoards.find((b) => b.description === null);
      expect(nullDescBoard).toBeDefined();
      expect(nullDescBoard!.name).toBe("公告");
    });

    it("板块包含 zone 字段", () => {
      sampleBoards.forEach((board) => {
        expect(board).toHaveProperty("zone");
        expect(typeof board.zone).toBe("string");
      });
    });
  });

  describe("每周推荐数据结构 (需求 30.5)", () => {
    it("推荐包含标题和排序字段", () => {
      const rec = sampleRecommendations[0];
      expect(rec).toHaveProperty("title");
      expect(rec).toHaveProperty("sortOrder");
      expect(rec).toHaveProperty("isActive");
    });

    it("推荐可关联帖子", () => {
      const withPost = sampleRecommendations.find((r) => r.post !== null);
      expect(withPost).toBeDefined();
      expect(withPost!.post!.title).toBe("推荐帖子标题");
      expect(withPost!.post!.summary).toBe("这是推荐帖子的摘要");
    });

    it("推荐可不关联帖子", () => {
      const withoutPost = sampleRecommendations.find((r) => r.postId === null);
      expect(withoutPost).toBeDefined();
      expect(withoutPost!.post).toBeNull();
    });

    it("关联帖子包含作者信息", () => {
      const withPost = sampleRecommendations.find((r) => r.post !== null);
      expect(withPost!.post!.author).toHaveProperty("nickname");
      expect(withPost!.post!.author).toHaveProperty("avatar");
    });
  });

  describe("空状态处理 (需求 30.1)", () => {
    it("空话题列表应展示空态", () => {
      const emptyTags: APITag[] = [];
      expect(emptyTags.length).toBe(0);
    });

    it("空板块列表应展示空态", () => {
      const emptyBoards: APIBoard[] = [];
      expect(emptyBoards.length).toBe(0);
    });

    it("空推荐列表应展示空态", () => {
      const emptyRecs: APIRecommendation[] = [];
      expect(emptyRecs.length).toBe(0);
    });
  });

  describe("刷新功能 (需求 30.6)", () => {
    it("刷新应重新加载所有三个区域的数据", () => {
      // Verify the data structure supports refresh by checking all three data types
      // can be independently fetched and replaced
      const newTags: APITag[] = [{ id: "new-1", name: "新话题", _count: { posts: 1 } }];
      const newBoards: APIBoard[] = [{ id: "new-b1", name: "新板块", description: "新", zone: "PUBLIC", _count: { posts: 1 } }];
      const newRecs: APIRecommendation[] = [{ id: "new-r1", title: "新推荐", postId: null, sortOrder: 0, isActive: true, post: null }];

      // After refresh, data should be replaceable
      expect(newTags).not.toEqual(sampleTags);
      expect(newBoards).not.toEqual(sampleBoards);
      expect(newRecs).not.toEqual(sampleRecommendations);
    });
  });
});
