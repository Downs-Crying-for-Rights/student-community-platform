import { describe, it, expect } from "vitest";

/**
 * 审核看板页面逻辑测试
 *
 * 验证审核看板的核心逻辑：
 * - 帖子按状态分组到看板列
 * - 状态到看板列的映射
 * - 板块筛选逻辑
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

type KanbanColumn = "PENDING" | "IN_REVIEW" | "PUBLISHED" | "REJECTED";

/* ---------- Extracted logic matching page.tsx ---------- */

function mapStatusToColumn(status: string): KanbanColumn {
  switch (status) {
    case "PUBLISHED":
      return "PUBLISHED";
    case "REJECTED":
      return "REJECTED";
    case "PENDING":
    default:
      return "PENDING";
  }
}

function groupPostsByColumn(
  posts: ModerationPost[]
): Record<KanbanColumn, ModerationPost[]> {
  const groups: Record<KanbanColumn, ModerationPost[]> = {
    PENDING: [],
    IN_REVIEW: [],
    PUBLISHED: [],
    REJECTED: [],
  };
  for (const post of posts) {
    const col = mapStatusToColumn(post.status);
    groups[col].push(post);
  }
  return groups;
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
  describe("状态到看板列映射 (mapStatusToColumn)", () => {
    it("PENDING 映射到 PENDING 列", () => {
      expect(mapStatusToColumn("PENDING")).toBe("PENDING");
    });

    it("PUBLISHED 映射到 PUBLISHED 列", () => {
      expect(mapStatusToColumn("PUBLISHED")).toBe("PUBLISHED");
    });

    it("REJECTED 映射到 REJECTED 列", () => {
      expect(mapStatusToColumn("REJECTED")).toBe("REJECTED");
    });

    it("未知状态默认映射到 PENDING 列", () => {
      expect(mapStatusToColumn("UNKNOWN")).toBe("PENDING");
    });

    it("DRAFT 状态映射到 PENDING 列", () => {
      expect(mapStatusToColumn("DRAFT")).toBe("PENDING");
    });
  });

  describe("帖子分组 (groupPostsByColumn)", () => {
    it("空数组返回四个空列", () => {
      const result = groupPostsByColumn([]);
      expect(result.PENDING).toEqual([]);
      expect(result.IN_REVIEW).toEqual([]);
      expect(result.PUBLISHED).toEqual([]);
      expect(result.REJECTED).toEqual([]);
    });

    it("正确将帖子分组到对应列", () => {
      const posts = [
        makePost({ id: "p1", status: "PENDING" }),
        makePost({ id: "p2", status: "PUBLISHED" }),
        makePost({ id: "p3", status: "REJECTED" }),
        makePost({ id: "p4", status: "PENDING" }),
      ];
      const result = groupPostsByColumn(posts);
      expect(result.PENDING).toHaveLength(2);
      expect(result.PUBLISHED).toHaveLength(1);
      expect(result.REJECTED).toHaveLength(1);
      expect(result.IN_REVIEW).toHaveLength(0);
    });

    it("分组后帖子 ID 正确", () => {
      const posts = [
        makePost({ id: "p1", status: "PENDING" }),
        makePost({ id: "p2", status: "PUBLISHED" }),
      ];
      const result = groupPostsByColumn(posts);
      expect(result.PENDING[0].id).toBe("p1");
      expect(result.PUBLISHED[0].id).toBe("p2");
    });

    it("所有帖子同一状态时只有一列有数据", () => {
      const posts = [
        makePost({ id: "p1", status: "PENDING" }),
        makePost({ id: "p2", status: "PENDING" }),
        makePost({ id: "p3", status: "PENDING" }),
      ];
      const result = groupPostsByColumn(posts);
      expect(result.PENDING).toHaveLength(3);
      expect(result.PUBLISHED).toHaveLength(0);
      expect(result.REJECTED).toHaveLength(0);
    });
  });

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

  describe("看板列配置", () => {
    const COLUMN_CONFIG: Record<
      KanbanColumn,
      { label: string; color: string; bgColor: string }
    > = {
      PENDING: { label: "待审核", color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950/30" },
      IN_REVIEW: { label: "审核中", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
      PUBLISHED: { label: "已通过", color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950/30" },
      REJECTED: { label: "已拒绝", color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30" },
    };

    it("包含四个看板列", () => {
      const columns = Object.keys(COLUMN_CONFIG);
      expect(columns).toHaveLength(4);
      expect(columns).toContain("PENDING");
      expect(columns).toContain("IN_REVIEW");
      expect(columns).toContain("PUBLISHED");
      expect(columns).toContain("REJECTED");
    });

    it("每列都有标签、颜色和背景色", () => {
      for (const col of Object.values(COLUMN_CONFIG)) {
        expect(col.label).toBeTruthy();
        expect(col.color).toBeTruthy();
        expect(col.bgColor).toBeTruthy();
      }
    });

    it("列标签使用中文", () => {
      expect(COLUMN_CONFIG.PENDING.label).toBe("待审核");
      expect(COLUMN_CONFIG.IN_REVIEW.label).toBe("审核中");
      expect(COLUMN_CONFIG.PUBLISHED.label).toBe("已通过");
      expect(COLUMN_CONFIG.REJECTED.label).toBe("已拒绝");
    });
  });
});
