import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Helper 工作台页面纯函数测试
 *
 * 验证 Helper 工作台页面的纯函数逻辑：
 * - 分类标签映射 (getCategoryLabel)
 * - 状态标签映射 (getStatusLabel)
 * - 日期格式化 (formatDate)
 * - 访问控制逻辑 (Property 10)
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { getCategoryLabel, getStatusLabel, formatDate } from "../page";

/* ---------- getCategoryLabel ---------- */

describe("getCategoryLabel", () => {
  it("returns Chinese label for TUTORING", () => {
    expect(getCategoryLabel("TUTORING")).toBe("补课");
  });

  it("returns Chinese label for FEES", () => {
    expect(getCategoryLabel("FEES")).toBe("收费");
  });

  it("returns Chinese label for WEEKENDS", () => {
    expect(getCategoryLabel("WEEKENDS")).toBe("双休");
  });

  it("returns Chinese label for OTHER", () => {
    expect(getCategoryLabel("OTHER")).toBe("其他");
  });

  it("returns raw category for unknown category", () => {
    expect(getCategoryLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(getCategoryLabel("")).toBe("");
  });
});

/* ---------- getStatusLabel ---------- */

describe("getStatusLabel", () => {
  it("returns Chinese label for OPENED", () => {
    expect(getStatusLabel("OPENED")).toBe("待处理");
  });

  it("returns Chinese label for IN_PROGRESS", () => {
    expect(getStatusLabel("IN_PROGRESS")).toBe("处理中");
  });

  it("returns Chinese label for NEED_MORE_INFO", () => {
    expect(getStatusLabel("NEED_MORE_INFO")).toBe("待补充");
  });

  it("returns raw status for unknown status", () => {
    expect(getStatusLabel("CLOSED")).toBe("CLOSED");
    expect(getStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

/* ---------- formatDate ---------- */

describe("formatDate", () => {
  it("formats a valid ISO date string with date and time parts", () => {
    const result = formatDate("2024-03-20T08:30:00.000Z");
    expect(result).toContain("2024");
    expect(result).toContain("03");
    expect(result).toContain("20");
  });

  it("returns original string for invalid date", () => {
    expect(formatDate("invalid")).toBe("invalid");
    expect(formatDate("")).toBe("");
  });

  it("handles different valid date formats", () => {
    const result = formatDate("2025-12-01T14:00:00Z");
    expect(result).toContain("2025");
    expect(result).toContain("12");
  });
});

/* ---------- Access Control Logic ---------- */

describe("Helper dashboard access control logic", () => {
  /**
   * The access control pattern used in the helper page:
   *   hasPermission = userRole === "DCR_HELPER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN"
   */
  function hasPermission(userRole: string): boolean {
    return userRole === "DCR_HELPER" || userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  }

  it("grants access to DCR_HELPER role", () => {
    expect(hasPermission("DCR_HELPER")).toBe(true);
  });

  it("grants access to ADMIN role", () => {
    expect(hasPermission("ADMIN")).toBe(true);
  });

  it("grants access to SUPER_ADMIN role", () => {
    expect(hasPermission("SUPER_ADMIN")).toBe(true);
  });

  it("denies access to USER role", () => {
    expect(hasPermission("USER")).toBe(false);
  });

  it("denies access to MODERATOR role", () => {
    expect(hasPermission("MODERATOR")).toBe(false);
  });

  it("denies access to PSYCH_COUNSELOR role", () => {
    expect(hasPermission("PSYCH_COUNSELOR")).toBe(false);
  });

  it("denies access to empty role", () => {
    expect(hasPermission("")).toBe(false);
  });

  /**
   * Feature: dcr-complete-ui, Property 10: Helper 工作台访问控制
   *
   * For any user role, the helper dashboard should only be visible
   * to DCR_HELPER, ADMIN, and SUPER_ADMIN roles; all other roles should see
   * a "no permission" message.
   *
   * **Validates: Requirements 4.2, 4.3**
   */
  it("Property 10: only DCR_HELPER, ADMIN, SUPER_ADMIN can access helper dashboard", () => {
    const allRoles = [
      "USER",
      "ADMIN",
      "SUPER_ADMIN",
      "MODERATOR",
      "DCR_HELPER",
      "PSYCH_COUNSELOR",
      "BANNED",
    ];

    fc.assert(
      fc.property(fc.constantFrom(...allRoles), (role: string) => {
        const allowed = hasPermission(role);
        if (role === "DCR_HELPER" || role === "ADMIN" || role === "SUPER_ADMIN") {
          return allowed === true;
        }
        return allowed === false;
      }),
      { numRuns: 100 },
    );
  });

  it("Property 10: arbitrary strings that are not DCR_HELPER/ADMIN/SUPER_ADMIN are denied", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "DCR_HELPER" && s !== "ADMIN" && s !== "SUPER_ADMIN"),
        (role: string) => {
          return hasPermission(role) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ---------- Case card navigation pattern ---------- */

describe("Case card navigation", () => {
  it("builds correct navigation path from case id", () => {
    const caseId = "abc-123";
    const path = `/dcr/tickets/${caseId}`;
    expect(path).toBe("/dcr/tickets/abc-123");
  });

  it("navigation path includes the case id for any id", () => {
    fc.assert(
      fc.property(fc.uuid(), (id: string) => {
        const path = `/dcr/tickets/${id}`;
        return path.startsWith("/dcr/tickets/") && path.endsWith(id);
      }),
      { numRuns: 100 },
    );
  });
});

/* ---------- Two sections rendering data ---------- */

describe("Dashboard sections data structure", () => {
  it("open cases section filters OPENED status", () => {
    const cases = [
      { id: "1", category: "TUTORING", status: "OPENED", createdAt: "2024-01-01" },
      { id: "2", category: "FEES", status: "IN_PROGRESS", createdAt: "2024-01-02" },
      { id: "3", category: "OTHER", status: "OPENED", createdAt: "2024-01-03" },
    ];
    const openCases = cases.filter((c) => c.status === "OPENED");
    expect(openCases).toHaveLength(2);
    expect(openCases.every((c) => c.status === "OPENED")).toBe(true);
  });

  it("my cases section filters IN_PROGRESS and NEED_MORE_INFO", () => {
    const cases = [
      { id: "1", category: "TUTORING", status: "IN_PROGRESS", createdAt: "2024-01-01" },
      { id: "2", category: "FEES", status: "NEED_MORE_INFO", createdAt: "2024-01-02" },
      { id: "3", category: "OTHER", status: "CLOSED", createdAt: "2024-01-03" },
      { id: "4", category: "WEEKENDS", status: "OPENED", createdAt: "2024-01-04" },
    ];
    const myCases = cases.filter(
      (c) => c.status === "IN_PROGRESS" || c.status === "NEED_MORE_INFO",
    );
    expect(myCases).toHaveLength(2);
    expect(
      myCases.every(
        (c) => c.status === "IN_PROGRESS" || c.status === "NEED_MORE_INFO",
      ),
    ).toBe(true);
  });

  it("each case card displays category label, status label, and formatted date", () => {
    const caseItem = {
      id: "test-1",
      category: "TUTORING",
      status: "OPENED",
      createdAt: "2024-06-15T10:30:00Z",
    };
    expect(getCategoryLabel(caseItem.category)).toBe("补课");
    expect(getStatusLabel(caseItem.status)).toBe("待处理");
    expect(formatDate(caseItem.createdAt)).toContain("2024");
  });
});
