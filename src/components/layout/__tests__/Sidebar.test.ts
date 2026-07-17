import { describe, expect, it } from "vitest";
import {
  adminNavItems,
  hasMinRole,
  isActive,
  isVisible,
  moderationNavItems,
  sidebarCoreNavItems,
  sidebarZoneNavItems,
} from "../navigation-config";

describe("Sidebar navigation contract", () => {
  it("uses the shared six-item core navigation", () => {
    expect(sidebarCoreNavItems.map((item) => [item.label, item.href])).toEqual([
      ["首页", "/"],
      ["发现", "/discover"],
      ["消息", "/messages"],
      ["群聊", "/messages?tab=chat"],
      ["发布", "/create"],
      ["个人主页", "/u/me"],
    ]);
  });

  it("exposes one general DCR entry even before admission", () => {
    const visible = sidebarZoneNavItems.filter((item) =>
      isVisible(item, "USER", { dcrAccess: false }),
    );
    expect(visible.filter((item) => item.href.startsWith("/dcr"))).toEqual([
      expect.objectContaining({ href: "/dcr", label: "DCR 互助" }),
    ]);
  });

  it("keeps the psychology entry gated by psychAccess", () => {
    expect(
      sidebarZoneNavItems.filter((item) => isVisible(item, "USER", {})),
    ).not.toContainEqual(expect.objectContaining({ href: "/psych" }));
    expect(
      sidebarZoneNavItems.filter((item) =>
        isVisible(item, "USER", { psychAccess: true }),
      ),
    ).toContainEqual(expect.objectContaining({ href: "/psych" }));
  });

  it("shows Helper 工作台 only to helpers, admins, or explicit helper access", () => {
    const helper = sidebarZoneNavItems.find((item) => item.href === "/dcr/helper");
    expect(helper).toBeDefined();
    expect(isVisible(helper!, "USER", { dcrAccess: true })).toBe(false);
    expect(isVisible(helper!, "DCR_HELPER", {})).toBe(true);
    expect(isVisible(helper!, "USER", { dcrHelperAccess: true })).toBe(true);
    expect(isVisible(helper!, "ADMIN", {})).toBe(true);
  });

  it("does not expose parallel global DCR task, ticket, or cycle entries", () => {
    const hrefs = [...sidebarCoreNavItems, ...sidebarZoneNavItems].map(
      (item) => item.href,
    );
    expect(hrefs).not.toContain("/dcr/tasks");
    expect(hrefs).not.toContain("/dcr/tickets");
    expect(hrefs).not.toContain("/dcr/cycles");
  });

  it("activates the unified DCR item for every DCR child path", () => {
    expect(isActive("/dcr", "/dcr")).toBe(true);
    expect(isActive("/dcr", "/dcr/tasks/123")).toBe(true);
    expect(isActive("/dcr", "/dcr/tickets/123")).toBe(true);
    expect(isActive("/dcr", "/dcr/cycles/123")).toBe(true);
    expect(isActive("/dcr", "/dcr-helper")).toBe(false);
  });

  it("uses exact/segment-aware activation and the chat special case", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/discover")).toBe(false);
    expect(isActive("/messages", "/messages/123")).toBe(true);
    expect(isActive("/messages", "/messages-old")).toBe(false);
    expect(isActive("/messages?tab=chat", "/chat/123")).toBe(true);
  });

  it("preserves moderation and all admin destinations", () => {
    expect(moderationNavItems).toEqual([
      expect.objectContaining({ href: "/moderation", minRole: "MODERATOR" }),
    ]);
    expect(adminNavItems).toHaveLength(18);
    expect(adminNavItems.map((item) => item.href)).toEqual([
      "/admin/users",
      "/admin/content",
      "/admin/invites",
      "/admin/audit",
      "/admin/boards",
      "/admin/kb",
      "/admin/applications",
      "/admin/dcr/reviews",
      "/admin/dcr/questions",
      "/admin/quiz",
      "/admin/chat-rooms",
      "/admin/disputes",
      "/admin/tasks",
      "/admin/logs",
      "/admin/telemetry",
      "/admin/system",
      "/admin/dcr/tutorial",
      "/admin/site-content",
    ]);
  });

  it("applies the real role hierarchy and treats unknown roles as USER", () => {
    expect(hasMinRole("ADMIN", "MODERATOR")).toBe(true);
    expect(hasMinRole("MODERATOR", "ADMIN")).toBe(false);
    expect(hasMinRole("UNKNOWN", "USER")).toBe(true);
    expect(hasMinRole("UNKNOWN", "TRUSTED_USER")).toBe(false);
  });
});
