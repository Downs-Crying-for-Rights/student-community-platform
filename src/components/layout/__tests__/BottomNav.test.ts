import { describe, expect, it } from "vitest";
import {
  bottomMoreNavItems,
  bottomPrimaryNavItems,
  formatUnreadCount,
  getUnreadAccessibleLabel,
  isActive,
  isVisible,
} from "../navigation-config";
import { getBottomNavIcon } from "../BottomNav";

describe("BottomNav navigation contract", () => {
  it("configures an icon for every mobile navigation item", () => {
    for (const item of [...bottomPrimaryNavItems, ...bottomMoreNavItems]) {
      expect(() => getBottomNavIcon(item)).not.toThrow();
    }
  });

  it("keeps the four configured links plus the More control", () => {
    expect(bottomPrimaryNavItems.map((item) => [item.label, item.href])).toEqual([
      ["首页", "/"],
      ["发现", "/discover"],
      ["发布", "/create"],
      ["消息", "/messages"],
    ]);
    expect(bottomPrimaryNavItems.find((item) => item.href === "/create")?.raised).toBe(true);
  });

  it("keeps 我的、群聊、DCR、客服、心理、审核 in More", () => {
    expect(bottomMoreNavItems.map((item) => [item.label, item.href])).toEqual([
      ["我的", "/u/me"],
      ["群聊", "/messages?tab=chat"],
      ["DCR 互助", "/dcr"],
      ["客服工单", "/support"],
      ["心理区", "/psych"],
      ["审核", "/admin/moderation"],
    ]);
  });

  it("shows DCR before admission while retaining psych and moderation rules", () => {
    const userItems = bottomMoreNavItems.filter((item) =>
      isVisible(item, "USER", { dcrAccess: false }),
    );
    expect(userItems.map((item) => item.href)).toEqual([
      "/u/me",
      "/messages?tab=chat",
      "/dcr",
      "/support",
    ]);

    expect(
      bottomMoreNavItems.filter((item) =>
        isVisible(item, "MODERATOR", { psychAccess: true }),
      ).map((item) => item.href),
    ).toEqual([
      "/u/me",
      "/messages?tab=chat",
      "/dcr",
      "/support",
      "/psych",
      "/admin/moderation",
    ]);
  });

  it("does not duplicate DCR child destinations in More", () => {
    const hrefs = bottomMoreNavItems.map((item) => item.href);
    expect(hrefs).not.toContain("/dcr/tasks");
    expect(hrefs).not.toContain("/dcr/tickets");
    expect(hrefs).not.toContain("/dcr/cycles");
  });

  it("activates the single DCR item on child routes", () => {
    expect(isActive("/dcr", "/dcr/tasks/1")).toBe(true);
    expect(isActive("/dcr", "/dcr/tickets/1")).toBe(true);
    expect(isActive("/dcr", "/dcr/cycles/1")).toBe(true);
  });

  it("formats the unread badge and provides an accessible full count", () => {
    expect(formatUnreadCount(0)).toBeNull();
    expect(getUnreadAccessibleLabel(0)).toBeNull();
    expect(formatUnreadCount(42)).toBe("42");
    expect(getUnreadAccessibleLabel(42)).toBe("42 条未读消息");
    expect(formatUnreadCount(100)).toBe("99+");
    expect(getUnreadAccessibleLabel(100)).toBe("100 条未读消息");
  });
});
