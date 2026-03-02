import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    SUPER_ADMIN_OVERRIDE: "SUPER_ADMIN_OVERRIDE",
  },
  AuditTargetType: {
    USER: "USER",
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/users/u1/override", {
    method: "PATCH",
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


const defaultUser = {
  id: "u1",
  reputationScore: 100,
  violationCount: 0,
  psychAccess: false,
  dcrAccess: false,
  dcrPledgeSigned: false,
  quizPassed: true,
  onboardingDone: true,
  role: "USER",
};

// ==================== Tests ====================

describe("PATCH /api/admin/users/[id]/override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: 50 }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 ADMIN 用户访问", async () => {
    setSession("user1", "USER");
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: 50 }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(403);
  });

  it("应返回 403 当 ADMIN（非 SUPER_ADMIN）用户访问", async () => {
    setSession("admin1", "ADMIN");
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: 50 }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("权限不足");
  });

  it("应返回 404 当目标用户不存在", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: 50 }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("用户不存在");
  });

  it("应返回 400 当请求体为空对象", async () => {
    setSession("sa1", "SUPER_ADMIN");
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({}), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("无有效修改字段");
  });

  it("应返回 400 当字段值类型错误", async () => {
    setSession("sa1", "SUPER_ADMIN");
    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: "abc" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(400);
  });

  it("应成功覆写 reputationScore 并记录审计日志", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ ...defaultUser });
    const updatedUser = { ...defaultUser, reputationScore: 500 };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ reputationScore: 500 }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.reputationScore).toBe(500);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { reputationScore: 500 },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "sa1",
      "SUPER_ADMIN_OVERRIDE",
      "USER",
      "u1",
      { beforeValues: { reputationScore: 100 }, afterValues: { reputationScore: 500 } },
    );
  });

  it("应成功覆写多个字段", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ ...defaultUser });
    const updatedUser = { ...defaultUser, reputationScore: 200, violationCount: 5, psychAccess: true };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(
      makeRequest({ reputationScore: 200, violationCount: 5, psychAccess: true }),
      { params: Promise.resolve({ id: "u1" }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reputationScore: 200, violationCount: 5, psychAccess: true },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      "sa1",
      "SUPER_ADMIN_OVERRIDE",
      "USER",
      "u1",
      {
        beforeValues: { reputationScore: 100, violationCount: 0, psychAccess: false },
        afterValues: { reputationScore: 200, violationCount: 5, psychAccess: true },
      },
    );
  });

  it("应成功覆写布尔属性", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ ...defaultUser });
    const updatedUser = { ...defaultUser, dcrAccess: true, dcrPledgeSigned: true };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(
      makeRequest({ dcrAccess: true, dcrPledgeSigned: true }),
      { params: Promise.resolve({ id: "u1" }) },
    );

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dcrAccess: true, dcrPledgeSigned: true },
      }),
    );
  });

  it("应成功覆写 role 字段", async () => {
    setSession("sa1", "SUPER_ADMIN");
    mockUserFindUnique.mockResolvedValue({ ...defaultUser });
    const updatedUser = { ...defaultUser, role: "ADMIN" };
    mockUserUpdate.mockResolvedValue(updatedUser);
    mockLogAudit.mockResolvedValue({});

    const { PATCH } = await import("../[id]/override/route");
    const res = await PATCH(makeRequest({ role: "ADMIN" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.role).toBe("ADMIN");
  });
});
