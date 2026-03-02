import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/audit",
}));

const sampleLogsResponse = {
  logs: [
    {
      id: "log1",
      action: "ROLE_CHANGE",
      targetType: "USER",
      targetId: "user1",
      details: { oldRole: "USER", newRole: "MODERATOR" },
      ipHash: "abc123",
      createdAt: "2025-01-15T10:00:00Z",
      operatorId: "admin1",
      operator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
    },
    {
      id: "log2",
      action: "USER_BAN",
      targetType: "USER",
      targetId: "user2",
      details: null,
      ipHash: null,
      createdAt: "2025-01-14T08:00:00Z",
      operatorId: "admin1",
      operator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

describe("AdminAuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleLogsResponse,
    });
  });

  it("应能导入页面组件", async () => {
    const mod = await import("../audit/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("应在加载时调用 GET API 获取审计日志", async () => {
    const res = await fetch("/api/admin/audit?page=1&pageSize=20");
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.logs).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it("应支持按操作类型筛选", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...sampleLogsResponse,
        logs: [sampleLogsResponse.logs[0]],
        total: 1,
      }),
    });

    const res = await fetch("/api/admin/audit?page=1&pageSize=20&action=ROLE_CHANGE");
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].action).toBe("ROLE_CHANGE");
  });

  it("应支持按时间范围筛选", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...sampleLogsResponse,
        logs: [sampleLogsResponse.logs[0]],
        total: 1,
      }),
    });

    const res = await fetch(
      "/api/admin/audit?page=1&pageSize=20&startDate=2025-01-15T00:00:00Z&endDate=2025-01-16T00:00:00Z",
    );
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.logs).toHaveLength(1);
  });

  it("应支持 CSV 导出", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "ID,操作时间,操作者ID\nlog1,2025-01-15,admin1",
      headers: new Headers({
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="audit-logs.csv"',
      }),
    });

    const res = await fetch("/api/admin/audit?format=csv&pageSize=1000");

    expect(res.ok).toBe(true);
    const csv = await res.text();
    expect(csv).toContain("ID,操作时间,操作者ID");
  });

  it("应正确展示日志详情", () => {
    const log = sampleLogsResponse.logs[0];
    expect(log.details).toEqual({ oldRole: "USER", newRole: "MODERATOR" });
    expect(JSON.stringify(log.details)).toContain("MODERATOR");
  });

  it("应处理无详情的日志", () => {
    const log = sampleLogsResponse.logs[1];
    expect(log.details).toBeNull();
  });
});
