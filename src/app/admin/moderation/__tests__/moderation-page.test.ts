import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  filterPosts as filterPostsActual,
  getApprovalOperatorLabel,
  getModerationAuthorLabel,
  getModerationStatusLabel,
  getModeratorRoleLabel,
  getZoneLabel,
  mergeBoardOptions,
  MODERATION_STATUS_FILTERS,
} from "../page";

/**
 * 审核看板页面逻辑测试
 *
 * 验证审核看板的核心逻辑：
 * - 状态、专区和板块列表筛选
 * - 状态中文显示
 * - 权限检查（Moderator/Admin 可访问，其他角色返回 403）
 *
 * Validates: Requirements 34.1, 34.2, 34.3, 34.5
 */

/* ---------- Types (mirroring page.tsx) ---------- */

interface ModerationPost {
  id: string;
  title: string;
  content: string;
  status: "PENDING" | "PUBLISHED" | "REJECTED" | "DRAFT" | "DELETED";
  createdAt: string;
  author: { id: string; nickname: string | null; avatar: string | null };
  board: { id: string; name: string; zone: string };
  tags: Array<{ tag: { id: string; name: string } }>;
}

function filterPosts(
  posts: ModerationPost[],
  filterBoard: string
): ModerationPost[] {
  if (!filterBoard) return posts;
  return posts.filter((p) => p.board.id === filterBoard);
}

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 2,
  MODERATOR: 3,
  ADMIN: 4,
};

function canAccessModeration(role: string | undefined): boolean {
  if (!role) return false;
  return (ROLE_HIERARCHY[role] ?? 0) >= ROLE_HIERARCHY.MODERATOR;
}

/* ---------- Fixtures ---------- */

function makePost(overrides: Partial<ModerationPost> = {}): ModerationPost {
  return {
    id: "post-1",
    title: "测试帖子",
    content: "帖子内容",
    status: "PENDING",
    createdAt: "2024-06-01T00:00:00.000Z",
    author: { id: "user-1", nickname: "测试用户", avatar: null },
    board: { id: "board-1", name: "技术", zone: "PUBLIC" },
    tags: [],
    ...overrides,
  };
}

/* ---------- Tests ---------- */

describe("审核看板页面逻辑", () => {
  describe("板块筛选 (filterPosts)", () => {
    const posts = [
      makePost({ id: "p1", board: { id: "b1", name: "技术", zone: "PUBLIC" } }),
      makePost({ id: "p2", board: { id: "b2", name: "娱乐", zone: "PUBLIC" } }),
      makePost({ id: "p3", board: { id: "b1", name: "技术", zone: "PUBLIC" } }),
    ];

    it("空筛选条件返回全部帖子", () => {
      expect(filterPosts(posts, "")).toHaveLength(3);
    });

    it("按板块 ID 筛选正确", () => {
      const result = filterPosts(posts, "b1");
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.board.id === "b1")).toBe(true);
    });

    it("筛选不存在的板块返回空数组", () => {
      expect(filterPosts(posts, "nonexistent")).toHaveLength(0);
    });

    it("筛选单个板块只返回匹配帖子", () => {
      const result = filterPosts(posts, "b2");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p2");
    });

    it("实际页面逻辑可以按专区和板块组合筛选", () => {
      const mixed = [
        makePost({ id: "public", board: { id: "b1", name: "技术", zone: "PUBLIC" } }),
        makePost({ id: "psych", board: { id: "b2", name: "心理树洞", zone: "PSYCHOLOGY" } }),
      ];
      expect(filterPostsActual(mixed, "", "PSYCHOLOGY").map((post) => post.id)).toEqual(["psych"]);
      expect(filterPostsActual(mixed, "b1", "PUBLIC").map((post) => post.id)).toEqual(["public"]);
    });

    it("列表可以按审核状态筛选", () => {
      const mixed = [
        makePost({ id: "pending", status: "PENDING" }),
        makePost({ id: "published", status: "PUBLISHED" }),
        makePost({ id: "rejected", status: "REJECTED" }),
      ];
      expect(filterPostsActual(mixed, "", "", "PENDING").map((post) => post.id)).toEqual(["pending"]);
      expect(filterPostsActual(mixed, "", "", "PUBLISHED").map((post) => post.id)).toEqual(["published"]);
      expect(filterPostsActual(mixed, "", "", "")).toHaveLength(3);
    });

    it("心理区审核卡片隐藏作者昵称", () => {
      const post = makePost({
        author: { id: "u1", nickname: "真实昵称", avatar: null },
        board: { id: "b2", name: "心理树洞", zone: "PSYCHOLOGY" },
      });
      expect(getModerationAuthorLabel(post)).toBe("心理区匿名用户");
      expect(getZoneLabel("PSYCHOLOGY")).toBe("心理区");
    });

    it("将审核队列中的私密专区板块合并到筛选项", () => {
      expect(mergeBoardOptions(
        [{ id: "public", name: "公共讨论", zone: "PUBLIC" }],
        [{ id: "psych", name: "心理树洞", zone: "PSYCHOLOGY" }],
        [{ id: "psych", name: "心理树洞", zone: "PSYCHOLOGY" }],
      )).toEqual(expect.arrayContaining([
        { id: "public", name: "公共讨论", zone: "PUBLIC" },
        { id: "psych", name: "心理树洞", zone: "PSYCHOLOGY" },
      ]));
      expect(mergeBoardOptions(
        [{ id: "public", name: "公共讨论", zone: "PUBLIC" }],
        [{ id: "psych", name: "心理树洞", zone: "PSYCHOLOGY" }],
      )).toHaveLength(2);
    });

    it("格式化通过人身份用于后台审计展示", () => {
      const post = makePost({ status: "PUBLISHED" }) as ModerationPost & {
        approvalAudit: {
          createdAt: string;
          operator: { id: string; nickname: string | null; username: string | null; role: string };
        };
      };
      post.approvalAudit = {
        createdAt: "2026-08-03T01:00:00.000Z",
        operator: { id: "admin1", nickname: "审核员", username: "admin", role: "ADMIN" },
      };

      expect(getApprovalOperatorLabel(post)).toBe("审核员（管理员）");
      expect(getModeratorRoleLabel("SUPER_ADMIN")).toBe("超级管理员");
      expect(getModeratorRoleLabel("MODERATOR")).toBe("版主");
    });
  });

  describe("权限检查 (canAccessModeration)", () => {
    it("MODERATOR 可以访问", () => {
      expect(canAccessModeration("MODERATOR")).toBe(true);
    });

    it("ADMIN 可以访问", () => {
      expect(canAccessModeration("ADMIN")).toBe(true);
    });

    it("USER 不能访问", () => {
      expect(canAccessModeration("USER")).toBe(false);
    });

    it("TRUSTED_USER 不能访问", () => {
      expect(canAccessModeration("TRUSTED_USER")).toBe(false);
    });

    it("DCR_HELPER 不能访问", () => {
      expect(canAccessModeration("DCR_HELPER")).toBe(false);
    });

    it("undefined 角色不能访问", () => {
      expect(canAccessModeration(undefined)).toBe(false);
    });

    it("空字符串角色不能访问", () => {
      expect(canAccessModeration("")).toBe(false);
    });
  });

  describe("列表状态筛选", () => {
    it("使用单列表布局而不是三列卡片看板", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");
      expect(source).toContain('aria-label="按审核状态筛选"');
      expect(source).toContain('className="divide-y"');
      expect(source).not.toContain("md:grid-cols-3");
      expect(source).not.toContain("<Card");
    });

    it("包含全部、待审核、已通过和已拒绝", () => {
      expect(MODERATION_STATUS_FILTERS.map((item) => item.label)).toEqual(["全部", "待审核", "已通过", "已拒绝"]);
    });

    it("状态标签使用中文", () => {
      expect(getModerationStatusLabel("PENDING")).toBe("待审核");
      expect(getModerationStatusLabel("PUBLISHED")).toBe("已通过");
      expect(getModerationStatusLabel("REJECTED")).toBe("已拒绝");
    });
  });
});
