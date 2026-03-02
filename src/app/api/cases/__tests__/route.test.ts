import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockCaseCreate = vi.fn();
const mockCaseFindMany = vi.fn();
const mockCaseCount = vi.fn();
const mockAppFindFirst = vi.fn();
const mockAppCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    case: {
      create: (...args: unknown[]) => mockCaseCreate(...args),
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
      count: (...args: unknown[]) => mockCaseCount(...args),
    },
    accessApplication: {
      findFirst: (...args: unknown[]) => mockAppFindFirst(...args),
      create: (...args: unknown[]) => mockAppCreate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_ACCESS: "CASE_ACCESS", CASE_EXPORT: "CASE_EXPORT" },
  AuditTargetType: { CASE: "CASE" },
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makePostRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/cases", {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/cases");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("POST /api/cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ category: "TUTORING", formData: {}, pledgeText: "声明" }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 201 即使用户无 DCR 访问权限（委托表提交不需要 dcrAccess）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false });
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app1" });

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case1",
      category: "TUTORING",
      formData: {},
      status: "OPENED",
      pledgeText: "声明",
      submitterId: "user1",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user1", nickname: "测试用户" },
      timeline: [{ id: "te1", action: "委托创建", newStatus: "OPENED" }],
    });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ category: "TUTORING", formData: {}, pledgeText: "声明" }), { params: {} });
    expect(res.status).toBe(201);
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ category: "INVALID" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应成功创建委托", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false });
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "app1" });

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case1",
      category: "TUTORING",
      formData: { subject: "数学" },
      status: "OPENED",
      pledgeText: "我确认已移除所有可识别信息",
      submitterId: "user1",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user1", nickname: "测试用户" },
      timeline: [{ id: "te1", action: "委托创建", newStatus: "OPENED" }],
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({
        category: "TUTORING",
        formData: { subject: "数学" },
        pledgeText: "我确认已移除所有可识别信息",
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.case.status).toBe("OPENED");
    expect(data.case.category).toBe("TUTORING");
  });

  it("应自动创建 AccessApplication 当用户无 dcrAccess 且无 PENDING 申请", async () => {
    setSession("user2", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user2", dcrAccess: false });
    mockAppFindFirst.mockResolvedValue(null); // no pending application
    mockAppCreate.mockResolvedValue({ id: "app-auto" });

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case2",
      category: "TUTORING",
      formData: {},
      status: "OPENED",
      pledgeText: "声明",
      submitterId: "user2",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user2", nickname: "用户2" },
      timeline: [],
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({ category: "TUTORING", formData: {}, pledgeText: "声明" }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockAppCreate).toHaveBeenCalledWith({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText: "声明",
        applicantId: "user2",
      },
    });
  });

  it("不应重复创建 AccessApplication 当已有 PENDING 申请", async () => {
    setSession("user3", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user3", dcrAccess: false });
    mockAppFindFirst.mockResolvedValue({ id: "existing-app" }); // already has pending

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case3",
      category: "TUTORING",
      formData: {},
      status: "OPENED",
      pledgeText: "声明",
      submitterId: "user3",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user3", nickname: "用户3" },
      timeline: [],
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({ category: "TUTORING", formData: {}, pledgeText: "声明" }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockAppCreate).not.toHaveBeenCalled();
  });

  it("不应创建 AccessApplication 当用户已有 dcrAccess", async () => {
    setSession("user4", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ id: "user4", dcrAccess: true });

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case4",
      category: "TUTORING",
      formData: {},
      status: "OPENED",
      pledgeText: "声明",
      submitterId: "user4",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user4", nickname: "用户4" },
      timeline: [],
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest({ category: "TUTORING", formData: {}, pledgeText: "声明" }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockAppFindFirst).not.toHaveBeenCalled();
    expect(mockAppCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("无 dcrAccess 用户调用 GET /api/cases 返回自己提交的 Case（非 403）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockCaseFindMany.mockResolvedValue([
      { id: "case1", status: "OPENED", category: "TUTORING", submitterId: "user1" },
    ]);
    mockCaseCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0].id).toBe("case1");
    expect(data.cases[0].submitterId).toBe("user1");
    expect(data.total).toBe(1);
  });

  it("应成功返回委托列表", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindMany.mockResolvedValue([
      { id: "case1", status: "OPENED", category: "TUTORING" },
    ]);
    mockCaseCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cases).toHaveLength(1);
    expect(data.total).toBe(1);
  });

  it("Admin 无需 dcrAccess 即可查看", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindMany.mockResolvedValue([]);
    mockCaseCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(200);
    // Should NOT call user.findUnique for Admin
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});

describe("GET /api/cases - 无 dcrAccess 且无 Case 的用户", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 200 和空列表（非 403）", async () => {
    setSession("user-no-cases", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockCaseFindMany.mockResolvedValue([]);
    mockCaseCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cases).toEqual([]);
    expect(data.total).toBe(0);
  });
});


describe("GET /api/cases - 保持性测试：有 dcrAccess 用户返回结果不变", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("有 dcrAccess 用户调用 GET /api/cases 应返回 200 及其 Case 列表", async () => {
    setSession("dcr-user", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });

    const now = new Date();
    const userCases = [
      { id: "c1", status: "OPENED", category: "TUTORING", submitterId: "dcr-user", createdAt: now, submitter: { id: "dcr-user", nickname: "DCR用户" }, handler: null },
      { id: "c2", status: "CLOSED", category: "TUTORING", submitterId: "dcr-user", createdAt: now, submitter: { id: "dcr-user", nickname: "DCR用户" }, handler: null },
    ];
    mockCaseFindMany.mockResolvedValue(userCases);
    mockCaseCount.mockResolvedValue(2);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cases).toHaveLength(2);
    expect(data.cases[0].id).toBe("c1");
    expect(data.cases[1].id).toBe("c2");
    expect(data.total).toBe(2);
    expect(data.page).toBeDefined();
    expect(data.pageSize).toBeDefined();
  });

  it("有 dcrAccess 用户查询时 where 条件包含 AND/OR 条件（可看到 OPENED 案件）", async () => {
    setSession("dcr-user2", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindMany.mockResolvedValue([]);
    mockCaseCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(200);
    // Verify findMany was called with AND/OR constraint (can see OPENED + own + handled via CaseHandler)
    const findManyCall = mockCaseFindMany.mock.calls[0][0];
    expect(findManyCall.where.AND).toEqual([
      {
        OR: [
          { handlers: { some: { userId: "dcr-user2" } } },
          { submitterId: "dcr-user2" },
          { status: "OPENED" },
        ],
      },
    ]);
  });

  it("有 dcrAccess 用户可使用 status 过滤参数", async () => {
    setSession("dcr-user3", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindMany.mockResolvedValue([
      { id: "c3", status: "OPENED", category: "TUTORING", submitterId: "dcr-user3" },
    ]);
    mockCaseCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ status: "OPENED" }), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cases).toHaveLength(1);
    expect(data.cases[0].status).toBe("OPENED");
    // Verify status filter is embedded in AND structure alongside OR conditions
    const findManyCall = mockCaseFindMany.mock.calls[0][0];
    expect(findManyCall.where.AND).toEqual([
      {
        OR: [
          { handlers: { some: { userId: "dcr-user3" } } },
          { submitterId: "dcr-user3" },
          { status: "OPENED" },
        ],
      },
      { status: "OPENED" },
    ]);
    // status should NOT be at top level (that was the bug)
    expect(findManyCall.where.status).toBeUndefined();
  });
});

describe("GET /api/cases - 保持性测试：未登录用户返回 401", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("未登录用户调用 GET /api/cases 应返回 401 未授权错误", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest(), { params: {} });

    expect(res.status).toBe(401);
    // Should not attempt any DB queries for unauthenticated requests
    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockCaseFindMany).not.toHaveBeenCalled();
    expect(mockCaseCount).not.toHaveBeenCalled();
  });

  it("未登录用户带查询参数调用 GET /api/cases 仍返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ status: "OPENED", page: "1", pageSize: "10" }), { params: {} });

    expect(res.status).toBe(401);
    expect(mockCaseFindMany).not.toHaveBeenCalled();
  });
});
