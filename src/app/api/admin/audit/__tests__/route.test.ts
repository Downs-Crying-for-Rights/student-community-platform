import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockFindMany = vi.fn();
const mockCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    auditLog: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue({}),
  AuditAction: {
    ROLE_CHANGE: "ROLE_CHANGE",
    USER_BAN: "USER_BAN",
    USER_UNBAN: "USER_UNBAN",
    SHADOW_BAN: "SHADOW_BAN",
    CONTENT_APPROVE: "CONTENT_APPROVE",
    CONTENT_REJECT: "CONTENT_REJECT",
    REPORT_RESOLVE: "REPORT_RESOLVE",
    REPORT_DISMISS: "REPORT_DISMISS",
    DCR_ACCESS_GRANT: "DCR_ACCESS_GRANT",
    DCR_ACCESS_REVOKE: "DCR_ACCESS_REVOKE",
    CASE_EXPORT: "CASE_EXPORT",
    CASE_ACCESS: "CASE_ACCESS",
    BOARD_PERMISSION_CHANGE: "BOARD_PERMISSION_CHANGE",
    PSYCH_ACCESS_GRANT: "PSYCH_ACCESS_GRANT",
    UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
    INVITE_CREATE: "INVITE_CREATE",
    INVITE_REVOKE: "INVITE_REVOKE",
  },
  AuditTargetType: {
    USER: "USER",
    POST: "POST",
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeGetRequest(url?: string): NextRequest {
  return new NextRequest(url ?? "http://localhost:3000/api/admin/audit", { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const sampleLogs = [
  {
    id: "log1",
    action: "ROLE_CHANGE",
    targetType: "USER",
    targetId: "user1",
    details: { oldRole: "USER", newRole: "MODERATOR" },
    ipHash: "abc123",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    operatorId: "admin1",
    operator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
  },
  {
    id: "log2",
    action: "USER_BAN",
    targetType: "USER",
    targetId: "user2",
    details: { reason: "违规" },
    ipHash: "def456",
    createdAt: new Date("2025-01-14T08:00:00Z"),
    operatorId: "admin1",
    operator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
  },
];

// ==================== Tests ====================

describe("GET /api/admin/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 Moderator 用户访问", async () => {
    setSession("mod1", "MODERATOR");
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回审计日志列表（Admin）", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.logs).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    expect(data.totalPages).toBe(1);
  });

  it("应支持按操作类型筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleLogs[0]]);
    mockCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?action=ROLE_CHANGE"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: "ROLE_CHANGE" }),
      }),
    );
  });

  it("应支持按操作者 ID 筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?operatorId=admin1"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ operatorId: "admin1" }),
      }),
    );
  });

  it("应支持按目标类型筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?targetType=USER"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ targetType: "USER" }),
      }),
    );
  });

  it("应支持按时间范围筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleLogs[0]]);
    mockCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest(
        "http://localhost:3000/api/admin/audit?startDate=2025-01-15T00:00:00Z&endDate=2025-01-16T00:00:00Z",
      ),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2025-01-15T00:00:00Z"),
            lte: new Date("2025-01-16T00:00:00Z"),
          },
        }),
      }),
    );
  });

  it("应支持分页", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleLogs[1]]);
    mockCount.mockResolvedValue(25);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?page=2&pageSize=10"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
    expect(data.totalPages).toBe(3);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it("应支持 CSV 导出格式", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?format=csv"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const csv = await res.text();
    expect(csv).toContain("ID,操作时间,操作者ID");
    expect(csv).toContain("log1");
    expect(csv).toContain("ROLE_CHANGE");
  });

  it("应返回 400 当操作类型无效", async () => {
    setSession("admin1", "ADMIN");

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/audit?action=INVALID_ACTION"),
      { params: {} },
    );

    expect(res.status).toBe(400);
  });

  it("应包含操作者信息", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(data.logs[0].operator).toEqual({
      id: "admin1",
      nickname: "管理员",
      email: "admin@test.com",
    });
  });

  it("应按 createdAt 降序排列", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleLogs);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    await GET(makeGetRequest(), { params: {} });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});
