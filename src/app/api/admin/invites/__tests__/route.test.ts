import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    inviteCode: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const mockLogAudit = vi.fn().mockResolvedValue({});
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    INVITE_CREATE: "INVITE_CREATE",
    INVITE_REVOKE: "INVITE_REVOKE",
  },
  AuditTargetType: {
    INVITE_CODE: "INVITE_CODE",
  },
}));

vi.mock("@/lib/utils", () => ({
  generateInviteCode: vi.fn().mockReturnValue("ABCD1234"),
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
  return new NextRequest(url ?? "http://localhost:3000/api/admin/invites", { method: "GET" });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/invites", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const sampleInvites = [
  {
    id: "inv1",
    code: "ABCD1234",
    isUsed: false,
    isRevoked: false,
    expiresAt: new Date("2025-12-31"),
    createdAt: new Date("2025-01-01"),
    usedAt: null,
    creator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
    usedBy: null,
  },
  {
    id: "inv2",
    code: "EFGH5678",
    isUsed: true,
    isRevoked: false,
    expiresAt: new Date("2025-12-31"),
    createdAt: new Date("2025-01-02"),
    usedAt: new Date("2025-01-05"),
    creator: { id: "admin1", nickname: "管理员", email: "admin@test.com" },
    usedBy: { id: "user1", nickname: "用户1", email: "user1@test.com" },
  },
];

// ==================== Tests ====================

describe("GET /api/admin/invites", () => {
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

  it("应返回邀请码列表（Admin）", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue(sampleInvites);
    mockCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.invites).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    expect(data.totalPages).toBe(1);
  });

  it("应支持按 unused 状态筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleInvites[0]]);
    mockCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/invites?status=unused"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isUsed: false, isRevoked: false }),
      }),
    );
  });

  it("应支持按 used 状态筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleInvites[1]]);
    mockCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/invites?status=used"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isUsed: true }),
      }),
    );
  });

  it("应支持按 revoked 状态筛选", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/invites?status=revoked"),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isRevoked: true }),
      }),
    );
  });

  it("应支持分页", async () => {
    setSession("admin1", "ADMIN");
    mockFindMany.mockResolvedValue([sampleInvites[1]]);
    mockCount.mockResolvedValue(25);

    const { GET } = await import("../route");
    const res = await GET(
      makeGetRequest("http://localhost:3000/api/admin/invites?page=2&pageSize=10"),
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
});

describe("POST /api/admin/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 1 }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户访问", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 1 }), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应成功生成单个邀请码", async () => {
    setSession("admin1", "ADMIN");
    mockCreate.mockResolvedValue({ id: "inv-new", code: "ABCD1234", expiresAt: new Date("2025-02-01") });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 1, expiresInDays: 7 }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.invites).toHaveLength(1);
    expect(data.invites[0].code).toBe("ABCD1234");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(
      "admin1",
      "INVITE_CREATE",
      "INVITE_CODE",
      expect.any(String),
      { count: 1, expiresInDays: 7 },
    );
  });

  it("应成功批量生成邀请码", async () => {
    setSession("admin1", "ADMIN");
    mockCreate
      .mockResolvedValueOnce({ id: "inv-1", code: "ABCD1234", expiresAt: new Date() })
      .mockResolvedValueOnce({ id: "inv-2", code: "ABCD1234", expiresAt: new Date() })
      .mockResolvedValueOnce({ id: "inv-3", code: "ABCD1234", expiresAt: new Date() });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 3, expiresInDays: 30 }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.invites).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("应使用默认值（count=1, expiresInDays=7）", async () => {
    setSession("admin1", "ADMIN");
    mockCreate.mockResolvedValue({ id: "inv-new", code: "ABCD1234", expiresAt: new Date() });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({}), { params: {} });

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("应返回 400 当 count 超出范围", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 11 }), { params: {} });

    expect(res.status).toBe(400);
  });

  it("应返回 400 当 expiresInDays 超出范围", async () => {
    setSession("admin1", "ADMIN");

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ count: 1, expiresInDays: 400 }), { params: {} });

    expect(res.status).toBe(400);
  });
});
