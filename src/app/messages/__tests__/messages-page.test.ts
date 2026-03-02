import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 通知页面逻辑测试
 *
 * 验证通知页面的核心逻辑：
 * - 通知按类型分组（互动通知 vs 系统通知）
 * - 通知类型分类
 * - 通知图标映射
 * - 时间格式化
 *
 * Validates: Requirements 33.1, 33.2, 33.3, 33.4, 33.5
 */

/* ---------- Import helpers from page ---------- */
import {
  classifyNotification,
  groupNotifications,
  getNotificationIcon,
  formatTime,
  type Notification,
} from "../page";

/* ---------- Fixtures ---------- */

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    type: "COMMENT",
    title: "新评论",
    content: "有人评论了你的帖子",
    isRead: false,
    link: "/post/123",
    createdAt: "2024-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/* ---------- Tests ---------- */

describe("通知页面逻辑", () => {
  describe("通知类型分类 (classifyNotification)", () => {
    it("COMMENT 归类为互动通知", () => {
      expect(classifyNotification("COMMENT")).toBe("interactive");
    });

    it("LIKE 归类为互动通知", () => {
      expect(classifyNotification("LIKE")).toBe("interactive");
    });

    it("PSYCH_MATCH 归类为互动通知", () => {
      expect(classifyNotification("PSYCH_MATCH")).toBe("interactive");
    });

    it("REPORT_RESULT 归类为系统通知", () => {
      expect(classifyNotification("REPORT_RESULT")).toBe("system");
    });

    it("CASE_UPDATE 归类为系统通知", () => {
      expect(classifyNotification("CASE_UPDATE")).toBe("system");
    });

    it("DCR_ACCESS 归类为系统通知", () => {
      expect(classifyNotification("DCR_ACCESS")).toBe("system");
    });

    it("SYSTEM 归类为系统通知", () => {
      expect(classifyNotification("SYSTEM")).toBe("system");
    });

    it("未知类型默认归类为系统通知", () => {
      expect(classifyNotification("UNKNOWN")).toBe("system");
    });
  });

  describe("通知分组 (groupNotifications)", () => {
    it("空数组返回两个空分组", () => {
      const result = groupNotifications([]);
      expect(result.interactive).toEqual([]);
      expect(result.system).toEqual([]);
    });

    it("正确将通知分组到互动和系统", () => {
      const notifications = [
        makeNotification({ id: "n1", type: "COMMENT" }),
        makeNotification({ id: "n2", type: "LIKE" }),
        makeNotification({ id: "n3", type: "SYSTEM" }),
        makeNotification({ id: "n4", type: "CASE_UPDATE" }),
        makeNotification({ id: "n5", type: "PSYCH_MATCH" }),
      ];
      const result = groupNotifications(notifications);
      expect(result.interactive).toHaveLength(3);
      expect(result.system).toHaveLength(2);
    });

    it("互动分组包含正确的通知 ID", () => {
      const notifications = [
        makeNotification({ id: "n1", type: "COMMENT" }),
        makeNotification({ id: "n2", type: "REPORT_RESULT" }),
      ];
      const result = groupNotifications(notifications);
      expect(result.interactive.map((n) => n.id)).toEqual(["n1"]);
      expect(result.system.map((n) => n.id)).toEqual(["n2"]);
    });

    it("全部为互动通知时系统分组为空", () => {
      const notifications = [
        makeNotification({ id: "n1", type: "COMMENT" }),
        makeNotification({ id: "n2", type: "LIKE" }),
      ];
      const result = groupNotifications(notifications);
      expect(result.interactive).toHaveLength(2);
      expect(result.system).toHaveLength(0);
    });

    it("全部为系统通知时互动分组为空", () => {
      const notifications = [
        makeNotification({ id: "n1", type: "SYSTEM" }),
        makeNotification({ id: "n2", type: "DCR_ACCESS" }),
      ];
      const result = groupNotifications(notifications);
      expect(result.interactive).toHaveLength(0);
      expect(result.system).toHaveLength(2);
    });

    it("保持原始顺序（时间倒序）", () => {
      const notifications = [
        makeNotification({ id: "n1", type: "COMMENT", createdAt: "2024-06-03T00:00:00Z" }),
        makeNotification({ id: "n2", type: "COMMENT", createdAt: "2024-06-02T00:00:00Z" }),
        makeNotification({ id: "n3", type: "COMMENT", createdAt: "2024-06-01T00:00:00Z" }),
      ];
      const result = groupNotifications(notifications);
      expect(result.interactive.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    });
  });

  describe("通知图标映射 (getNotificationIcon)", () => {
    it("每种类型返回图标组件", () => {
      const types = ["COMMENT", "LIKE", "PSYCH_MATCH", "REPORT_RESULT", "CASE_UPDATE", "DCR_ACCESS", "SYSTEM"];
      const icons = types.map((t) => getNotificationIcon(t));
      // All should be truthy (React components — could be function or object/forwardRef)
      icons.forEach((icon) => {
        expect(icon).toBeTruthy();
      });
    });

    it("COMMENT 和 LIKE 返回不同图标", () => {
      expect(getNotificationIcon("COMMENT")).not.toBe(getNotificationIcon("LIKE"));
    });

    it("未知类型返回默认图标 (Bell)", () => {
      const defaultIcon = getNotificationIcon("SYSTEM");
      const unknownIcon = getNotificationIcon("UNKNOWN_TYPE");
      expect(unknownIcon).toBe(defaultIcon);
    });
  });

  describe("时间格式化 (formatTime)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("不到 1 分钟显示'刚刚'", () => {
      expect(formatTime("2024-06-15T11:59:30.000Z")).toBe("刚刚");
    });

    it("几分钟前正确显示", () => {
      expect(formatTime("2024-06-15T11:55:00.000Z")).toBe("5 分钟前");
    });

    it("几小时前正确显示", () => {
      expect(formatTime("2024-06-15T09:00:00.000Z")).toBe("3 小时前");
    });

    it("几天前正确显示", () => {
      expect(formatTime("2024-06-13T12:00:00.000Z")).toBe("2 天前");
    });

    it("超过 30 天显示日期", () => {
      const result = formatTime("2024-05-01T00:00:00.000Z");
      // Should be a date string, not relative
      expect(result).not.toContain("分钟前");
      expect(result).not.toContain("小时前");
      expect(result).not.toContain("天前");
    });
  });
});
