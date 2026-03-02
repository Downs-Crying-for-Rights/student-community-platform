import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 个人主页逻辑测试
 *
 * 验证个人主页的核心逻辑：
 * - 加入时间格式化
 * - 帖子数据映射为 PostCard props
 * - Tab 可见性（自己 vs 他人）
 * - Tab 标签定义
 *
 * Validates: Requirements 32.1, 32.2, 32.3, 32.4, 32.5
 */

import {
  formatJoinDate,
  mapPostToCardProps,
  getVisibleTabs,
  TAB_LABELS,
  type ProfilePost,
  type ProfileTab,
} from "../[id]/page";

/* ---------- Fixtures ---------- */

function makeProfilePost(overrides: Partial<ProfilePost> = {}): ProfilePost {
  return {
    id: "post-1",
    title: "测试帖子",
    summary: "这是一个测试帖子的摘要",
    images: ["/img/cover.jpg"],
    isAnonymous: false,
    anonymousId: null,
    likeCount: 5,
    createdAt: "2024-06-01T00:00:00.000Z",
    author: { id: "user-1", nickname: "测试用户", avatar: "/avatar.jpg" },
    board: { id: "board-1", name: "娱乐", zone: "PUBLIC" },
    tags: [{ tag: { id: "tag-1", name: "技术" } }],
    ...overrides,
  };
}

/* ---------- Tests ---------- */

describe("个人主页逻辑", () => {
  describe("加入时间格式化 (formatJoinDate)", () => {
    it("格式化为中文日期", () => {
      const result = formatJoinDate("2024-01-15T00:00:00.000Z");
      expect(result).toContain("2024");
      expect(result).toContain("1");
      expect(result).toContain("15");
    });

    it("不同日期返回不同结果", () => {
      const a = formatJoinDate("2024-01-01T00:00:00.000Z");
      const b = formatJoinDate("2024-06-15T00:00:00.000Z");
      expect(a).not.toBe(b);
    });
  });

  describe("帖子数据映射 (mapPostToCardProps)", () => {
    it("正确映射基本字段", () => {
      const post = makeProfilePost();
      const props = mapPostToCardProps(post);

      expect(props.id).toBe("post-1");
      expect(props.title).toBe("测试帖子");
      expect(props.summary).toBe("这是一个测试帖子的摘要");
      expect(props.images).toEqual(["/img/cover.jpg"]);
      expect(props.likeCount).toBe(5);
    });

    it("正确映射作者信息", () => {
      const post = makeProfilePost();
      const props = mapPostToCardProps(post);

      expect(props.author.nickname).toBe("测试用户");
      expect(props.author.avatar).toBe("/avatar.jpg");
    });

    it("正确映射板块信息", () => {
      const post = makeProfilePost();
      const props = mapPostToCardProps(post);

      expect(props.board.name).toBe("娱乐");
      expect(props.board.zone).toBe("PUBLIC");
    });

    it("正确映射标签列表", () => {
      const post = makeProfilePost({
        tags: [
          { tag: { id: "t1", name: "技术" } },
          { tag: { id: "t2", name: "AI" } },
        ],
      });
      const props = mapPostToCardProps(post);

      expect(props.tags).toHaveLength(2);
      expect(props.tags[0]).toEqual({ id: "t1", name: "技术" });
      expect(props.tags[1]).toEqual({ id: "t2", name: "AI" });
    });

    it("匿名帖子正确映射", () => {
      const post = makeProfilePost({
        isAnonymous: true,
        anonymousId: "anon-123",
      });
      const props = mapPostToCardProps(post);

      expect(props.isAnonymous).toBe(true);
      expect(props.anonymousId).toBe("anon-123");
    });

    it("空标签列表映射为空数组", () => {
      const post = makeProfilePost({ tags: [] });
      const props = mapPostToCardProps(post);
      expect(props.tags).toEqual([]);
    });

    it("空图片列表映射为空数组", () => {
      const post = makeProfilePost({ images: [] });
      const props = mapPostToCardProps(post);
      expect(props.images).toEqual([]);
    });
  });

  describe("Tab 可见性 (getVisibleTabs)", () => {
    it("查看自己主页展示全部三个 Tab", () => {
      const tabs = getVisibleTabs(true);
      expect(tabs).toEqual(["posts", "bookmarks", "likes"]);
    });

    it("查看他人主页仅展示发帖 Tab", () => {
      const tabs = getVisibleTabs(false);
      expect(tabs).toEqual(["posts"]);
    });

    it("自己主页 Tab 数量为 3", () => {
      expect(getVisibleTabs(true)).toHaveLength(3);
    });

    it("他人主页 Tab 数量为 1", () => {
      expect(getVisibleTabs(false)).toHaveLength(1);
    });
  });

  describe("Tab 标签定义 (TAB_LABELS)", () => {
    it("包含所有三个 Tab 的中文标签", () => {
      expect(TAB_LABELS.posts).toBe("发帖");
      expect(TAB_LABELS.bookmarks).toBe("收藏");
      expect(TAB_LABELS.likes).toBe("点赞");
    });

    it("所有标签值非空", () => {
      const values = Object.values(TAB_LABELS);
      values.forEach((v) => {
        expect(v).toBeTruthy();
        expect(v.length).toBeGreaterThan(0);
      });
    });
  });
});
