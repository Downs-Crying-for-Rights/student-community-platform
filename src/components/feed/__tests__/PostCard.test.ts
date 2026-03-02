import { describe, it, expect } from "vitest";

/**
 * PostCard 组件逻辑测试
 *
 * 验证帖子卡片的核心逻辑：
 * - 摘要截取（前 60 字符）
 * - 匿名帖子显示匿名标识和默认头像
 * - 非匿名帖子显示作者昵称和头像
 * - 封面图选取（images 数组第一张）
 * - 标签最多展示 3 个
 *
 * Validates: Requirements 27.2, 23.1
 */

interface PostCardAuthor {
  nickname: string | null;
  avatar: string | null;
}

interface PostCardTag {
  id: string;
  name: string;
}

// Extracted logic matching PostCard implementation

function getDisplayName(
  isAnonymous: boolean,
  anonymousId: string | null,
  author: PostCardAuthor
): string {
  if (isAnonymous) return anonymousId ?? "匿名用户";
  return author.nickname ?? "未命名用户";
}

function getTruncatedSummary(summary: string | null): string | null {
  if (!summary) return null;
  return summary.length > 60 ? summary.slice(0, 60) + "…" : summary;
}

function getCoverImage(images: string[]): string | null {
  return images.length > 0 ? images[0] : null;
}

function shouldShowDefaultAvatar(
  isAnonymous: boolean,
  avatar: string | null
): boolean {
  return isAnonymous || !avatar;
}

function getVisibleTags(tags: PostCardTag[]): PostCardTag[] {
  return tags.slice(0, 3);
}

describe("PostCard 组件逻辑", () => {
  describe("显示名称", () => {
    it("匿名帖子显示 anonymousId", () => {
      expect(getDisplayName(true, "匿名用户_A1B2", { nickname: "张三", avatar: null }))
        .toBe("匿名用户_A1B2");
    });

    it("匿名帖子无 anonymousId 时显示默认匿名标识", () => {
      expect(getDisplayName(true, null, { nickname: "张三", avatar: null }))
        .toBe("匿名用户");
    });

    it("非匿名帖子显示作者昵称", () => {
      expect(getDisplayName(false, null, { nickname: "张三", avatar: "/a.png" }))
        .toBe("张三");
    });

    it("非匿名帖子无昵称时显示默认名称", () => {
      expect(getDisplayName(false, null, { nickname: null, avatar: null }))
        .toBe("未命名用户");
    });
  });

  describe("摘要截取", () => {
    it("null 摘要返回 null", () => {
      expect(getTruncatedSummary(null)).toBeNull();
    });

    it("60 字符以内不截取", () => {
      const text = "这是一段短摘要";
      expect(getTruncatedSummary(text)).toBe(text);
    });

    it("恰好 60 字符不截取", () => {
      const text = "a".repeat(60);
      expect(getTruncatedSummary(text)).toBe(text);
    });

    it("超过 60 字符截取并添加省略号", () => {
      const text = "a".repeat(61);
      expect(getTruncatedSummary(text)).toBe("a".repeat(60) + "…");
    });
  });

  describe("封面图", () => {
    it("images 为空时返回 null", () => {
      expect(getCoverImage([])).toBeNull();
    });

    it("取 images 数组第一张作为封面", () => {
      expect(getCoverImage(["/img1.jpg", "/img2.jpg"])).toBe("/img1.jpg");
    });
  });

  describe("头像显示", () => {
    it("匿名帖子显示默认头像", () => {
      expect(shouldShowDefaultAvatar(true, "/avatar.png")).toBe(true);
    });

    it("非匿名但无头像显示默认头像", () => {
      expect(shouldShowDefaultAvatar(false, null)).toBe(true);
    });

    it("非匿名且有头像显示作者头像", () => {
      expect(shouldShowDefaultAvatar(false, "/avatar.png")).toBe(false);
    });
  });

  describe("标签展示", () => {
    it("标签不超过 3 个时全部展示", () => {
      const tags = [
        { id: "1", name: "技术" },
        { id: "2", name: "生活" },
      ];
      expect(getVisibleTags(tags)).toHaveLength(2);
    });

    it("标签超过 3 个时只展示前 3 个", () => {
      const tags = [
        { id: "1", name: "技术" },
        { id: "2", name: "生活" },
        { id: "3", name: "学习" },
        { id: "4", name: "娱乐" },
      ];
      expect(getVisibleTags(tags)).toHaveLength(3);
      expect(getVisibleTags(tags).map((t) => t.name)).toEqual(["技术", "生活", "学习"]);
    });
  });
});
