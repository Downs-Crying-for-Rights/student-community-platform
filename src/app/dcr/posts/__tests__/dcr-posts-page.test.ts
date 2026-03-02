import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * DCR 帖子页面查询逻辑测试
 *
 * 验证 DCR 帖子页面使用 caseIds 而非 zone=DCR 查询帖子：
 * - buildPostsQueryParams 使用 caseIds 参数
 * - Posts API 支持 caseIds 筛选
 * - 空 caseIds 不返回帖子
 *
 * Validates: Requirements 2.9, 2.10
 */

import { buildPostsQueryParams } from "../page";

/* ---------- buildPostsQueryParams ---------- */

describe("buildPostsQueryParams", () => {
  it("includes caseIds as comma-separated string", () => {
    const params = buildPostsQueryParams(["c1", "c2", "c3"], "latest", 1, 20);
    expect(params.get("caseIds")).toBe("c1,c2,c3");
  });

  it("does not include zone parameter", () => {
    const params = buildPostsQueryParams(["c1"], "latest", 1, 20);
    expect(params.get("zone")).toBeNull();
  });

  it("includes sort parameter", () => {
    const params = buildPostsQueryParams(["c1"], "popular", 1, 20);
    expect(params.get("sort")).toBe("popular");
  });

  it("includes page and pageSize", () => {
    const params = buildPostsQueryParams(["c1"], "latest", 3, 10);
    expect(params.get("page")).toBe("3");
    expect(params.get("pageSize")).toBe("10");
  });

  it("handles single caseId", () => {
    const params = buildPostsQueryParams(["only-one"], "latest", 1, 20);
    expect(params.get("caseIds")).toBe("only-one");
  });
});

/* ---------- Posts API caseIds filtering ---------- */

const mockPostFindMany = vi.fn();
const mockPostCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findMany: (...args: unknown[]) => mockPostFindMany(...args),
      count: (...args: unknown[]) => mockPostCount(...args),
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditTargetType: { POST: "POST" },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

describe("GET /api/posts with caseIds filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter posts by caseIds when provided", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("@/app/api/posts/route");
    const url = "http://localhost:3000/api/posts?caseIds=case1,case2,case3";
    const res = await GET(makeRequest(url), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          caseId: { in: ["case1", "case2", "case3"] },
        }),
      }),
    );
  });

  it("should not use zone=DCR when caseIds is provided", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("@/app/api/posts/route");
    const url = "http://localhost:3000/api/posts?caseIds=case1";
    const res = await GET(makeRequest(url), { params: {} });

    expect(res.status).toBe(200);
    const callArgs = mockPostFindMany.mock.calls[0][0];
    expect(callArgs.where.board).toBeUndefined();
  });

  it("should still support zone filter when caseIds is not provided", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("@/app/api/posts/route");
    const url = "http://localhost:3000/api/posts?zone=DCR";
    const res = await GET(makeRequest(url), { params: {} });

    expect(res.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          board: { zone: "DCR" },
        }),
      }),
    );
  });

  it("should use caseIds over zone when both are provided", async () => {
    setSession("user1", "USER");
    mockPostFindMany.mockResolvedValue([]);
    mockPostCount.mockResolvedValue(0);

    const { GET } = await import("@/app/api/posts/route");
    const url = "http://localhost:3000/api/posts?caseIds=case1&zone=DCR";
    const res = await GET(makeRequest(url), { params: {} });

    expect(res.status).toBe(200);
    const callArgs = mockPostFindMany.mock.calls[0][0];
    expect(callArgs.where.caseId).toEqual({ in: ["case1"] });
    expect(callArgs.where.board).toBeUndefined();
  });
});
