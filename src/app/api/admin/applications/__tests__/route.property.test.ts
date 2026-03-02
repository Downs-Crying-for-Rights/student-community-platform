import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

// ==================== Mocks ====================

const mockFindMany = vi.fn();
const mockCaseFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    accessApplication: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    case: {
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Constants ====================

const applicationTypes = ["DCR", "PSYCHOLOGY"] as const;
const applicationStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
const nonAdminRoles = ["USER", "TRUSTED_USER", "DCR_HELPER", "MODERATOR"] as const;

// ==================== Generators ====================

/** Generate a random application type */
function arbType() {
  return fc.constantFrom(...applicationTypes);
}

/** Generate a random application status */
function arbStatus() {
  return fc.constantFrom(...applicationStatuses);
}

/** Generate a mock application record */
function arbApplication(overrides?: { type?: string; status?: string }) {
  return fc.record({
    id: fc.uuid(),
    type: overrides?.type ? fc.constant(overrides.type) : arbType(),
    status: overrides?.status ? fc.constant(overrides.status) : arbStatus(),
    pledgeText: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    reviewNote: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    createdAt: fc.date({ min: new Date("2024-01-01T00:00:00.000Z"), max: new Date("2025-12-31T23:59:59.999Z"), noInvalidDate: true }),
    applicant: fc.record({
      id: fc.uuid(),
      nickname: fc.string({ minLength: 1, maxLength: 20 }),
    }),
  });
}

/** Generate a list of applications with random types and statuses */
function arbApplicationList(minLen = 0, maxLen = 10) {
  return fc.array(arbApplication(), { minLength: minLen, maxLength: maxLen });
}

// ==================== Helpers ====================

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/admin/applications");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

function setAdminWithDefaults() {
  setSession("admin1", "ADMIN");
  mockCaseFindMany.mockResolvedValue([]);
}


// ==================== Property 17: 申请列表筛选正确性 ====================
// Feature: dcr-complete-ui, Property 17: 申请列表筛选正确性
// **Validates: Requirements 9.2, 9.3**

describe("Property 17: 申请列表筛选正确性 — 返回记录匹配筛选条件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("按 type 筛选时，返回的所有记录 type 匹配", async () => {
    await fc.assert(
      fc.asyncProperty(arbType(), arbApplicationList(1, 8), async (type, apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();

        // Filter apps to match the type, simulating what prisma would return
        const filtered = apps.filter((a) => a.type === type);
        mockFindMany.mockResolvedValue(filtered);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest({ type }), { params: {} } as never);
        const data = await res.json();

        expect(res.status).toBe(200);
        for (const app of data.applications) {
          expect(app.type).toBe(type);
        }

        // Verify prisma was called with correct where clause
        const call = mockFindMany.mock.calls[0][0];
        expect(call.where.type).toBe(type);
      }),
      { numRuns: 100 },
    );
  });

  it("按 status 筛选时，返回的所有记录 status 匹配", async () => {
    await fc.assert(
      fc.asyncProperty(arbStatus(), arbApplicationList(1, 8), async (status, apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();

        const filtered = apps.filter((a) => a.status === status);
        mockFindMany.mockResolvedValue(filtered);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest({ status }), { params: {} } as never);
        const data = await res.json();

        expect(res.status).toBe(200);
        for (const app of data.applications) {
          expect(app.status).toBe(status);
        }

        const call = mockFindMany.mock.calls[0][0];
        expect(call.where.status).toBe(status);
      }),
      { numRuns: 100 },
    );
  });

  it("同时按 type 和 status 筛选时，where 条件包含两者", async () => {
    await fc.assert(
      fc.asyncProperty(arbType(), arbStatus(), arbApplicationList(0, 5), async (type, status, apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();

        const filtered = apps.filter((a) => a.type === type && a.status === status);
        mockFindMany.mockResolvedValue(filtered);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest({ type, status }), { params: {} } as never);
        const data = await res.json();

        expect(res.status).toBe(200);
        for (const app of data.applications) {
          expect(app.type).toBe(type);
          expect(app.status).toBe(status);
        }

        const call = mockFindMany.mock.calls[0][0];
        expect(call.where.type).toBe(type);
        expect(call.where.status).toBe(status);
      }),
      { numRuns: 100 },
    );
  });

  it("无筛选参数时，where 条件为空对象", async () => {
    await fc.assert(
      fc.asyncProperty(arbApplicationList(0, 5), async (apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();
        mockFindMany.mockResolvedValue(apps);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} } as never);

        expect(res.status).toBe(200);

        const call = mockFindMany.mock.calls[0][0];
        expect(call.where).toEqual({});
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 18: 申请列表按时间降序排列 ====================
// Feature: dcr-complete-ui, Property 18: 申请列表按时间降序排列
// **Validates: Requirements 9.4**

describe("Property 18: 申请列表按时间降序排列 — 返回记录按 createdAt 降序", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prisma 查询使用 createdAt desc 排序", async () => {
    await fc.assert(
      fc.asyncProperty(arbApplicationList(0, 8), async (apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();
        mockFindMany.mockResolvedValue(apps);

        const { GET } = await import("../route");
        await GET(makeGetRequest(), { params: {} } as never);

        const call = mockFindMany.mock.calls[0][0];
        expect(call.orderBy).toEqual({ createdAt: "desc" });
      }),
      { numRuns: 100 },
    );
  });

  it("返回的记录按 createdAt 降序排列", async () => {
    await fc.assert(
      fc.asyncProperty(arbApplicationList(2, 10), async (apps) => {
        vi.clearAllMocks();
        setAdminWithDefaults();

        // Sort descending to simulate what prisma would return
        const sorted = [...apps].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        mockFindMany.mockResolvedValue(sorted);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} } as never);
        const data = await res.json();

        const dates = data.applications.map((a: { createdAt: string }) =>
          new Date(a.createdAt).getTime(),
        );
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 19: 申请列表 API 仅限 ADMIN ====================
// Feature: dcr-complete-ui, Property 19: 申请列表 API 仅限 ADMIN
// **Validates: Requirements 9.5, 9.6**

describe("Property 19: 申请列表 API 仅限 ADMIN — 非 ADMIN 返回 403", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非 ADMIN 角色返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...nonAdminRoles), async (role) => {
        vi.clearAllMocks();
        setSession(`user-${role}`, role);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} } as never);
        expect(res.status).toBe(403);
      }),
      { numRuns: 100 },
    );
  });

  it("未认证用户返回 401", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue(null);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} } as never);
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("ADMIN 角色不返回 401 或 403", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant("ADMIN"), async () => {
        vi.clearAllMocks();
        setSession("admin-user", "ADMIN");
        mockFindMany.mockResolvedValue([]);
        mockCaseFindMany.mockResolvedValue([]);

        const { GET } = await import("../route");
        const res = await GET(makeGetRequest(), { params: {} } as never);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      }),
      { numRuns: 100 },
    );
  });
});
