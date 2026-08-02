import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockCaseCreate = vi.fn();
const mockCaseFindMany = vi.fn();
const mockCaseCount = vi.fn();
const mockAppFindFirst = vi.fn();
const mockAppCreate = vi.fn();
const mockAppUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => {
  const transactionClient = {
    case: {
      create: (...args: unknown[]) => mockCaseCreate(...args),
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
      count: (...args: unknown[]) => mockCaseCount(...args),
    },
    accessApplication: {
      findFirst: (...args: unknown[]) => mockAppFindFirst(...args),
      create: (...args: unknown[]) => mockAppCreate(...args),
      updateMany: (...args: unknown[]) => mockAppUpdateMany(...args),
    },
  };
  return {
    default: {
      user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
      ...transactionClient,
      $transaction: vi.fn((operation: (tx: typeof transactionClient) => unknown) => operation(transactionClient)),
    },
  };
});

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_ACCESS: "CASE_ACCESS", CASE_EXPORT: "CASE_EXPORT" },
  AuditTargetType: { CASE: "CASE" },
}));

vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/mail", () => ({
  sendAdminActionMail: vi.fn().mockResolvedValue({ sent: false, recipientCount: 0 }),
}));

vi.mock("@/lib/dcr-field-extractor", () => ({
  extractFields: vi.fn().mockReturnValue({
    extractedFields: { schoolName: "测试中学", typeCategory: "补课" },
    missingFields: [],
    log: [],
  }),
}));

vi.mock("@/lib/dcr-review-rules", () => ({
  reviewDelegation: vi.fn().mockReturnValue({
    decision: "APPROVED",
    reason: "审核通过",
    missingFields: [],
    warnings: [],
  }),
}));

import { getServerSession } from "next-auth/next";
import { scanContent } from "@/lib/sensitive-engine";
const mockGetServerSession = vi.mocked(getServerSession);

const validRequest = {
  category: "TUTORING",
  formData: {
    contentType: "学校补课类",
    schoolName: "测试中学",
    schoolCategory: "公立学历制学校",
    schoolType: "高级中学",
    schoolAddress: "测试地址",
    description: "这是用于测试的完整委托情况描述，包含足够的信息供管理员审核。",
    feeStatus: "none",
    demands: ["停止补课"],
    confirmations: [true, true, true, true],
    riskPreference: "仅站内沟通",
  },
};

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
  beforeEach(() => { vi.clearAllMocks(); mockAppUpdateMany.mockResolvedValue({ count: 0 }); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makePostRequest(validRequest), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 201 即使用户无 DCR 访问权限（委托表提交不需要 dcrAccess）", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false, phone: "13800138000", quizPassed: true });
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
    const res = await POST(makePostRequest(validRequest), { params: {} });
    expect(res.status).toBe(201);
  });

  it("投稿邀请码用户无需考核即可提交委托且不创建完整准入申请", async () => {
    setSession("contributor", "USER");
    mockUserFindUnique.mockResolvedValue({
      id: "contributor", role: "USER", dcrAccess: false,
      dcrContributionAccess: true, phone: null, quizPassed: false,
    });
    mockCaseCreate.mockResolvedValue({
      id: "case-contribution", category: "TUTORING", formData: {}, status: "OPENED",
      pledgeText: "声明", submitterId: "contributor", handlerId: null,
      createdAt: new Date(), updatedAt: new Date(),
      submitter: { id: "contributor", nickname: "投稿用户" }, timeline: [],
    });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest(validRequest), { params: {} });

    expect(res.status).toBe(201);
    expect(mockAppCreate).not.toHaveBeenCalled();
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false, phone: "13800138000", quizPassed: true });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ category: "INVALID" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("应成功创建委托", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: false, phone: "13800138000", quizPassed: true });
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
        ...validRequest,
        pledgeText: "客户端伪造的声明",
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.case.status).toBe("OPENED");
    expect(data.case.category).toBe("TUTORING");
    expect(mockCaseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requestStatus: "PENDING",
        reviewNote: "委托已提交，正在等待管理员审核",
      }),
    }));
  });

  it("应自动创建 AccessApplication 当用户无 dcrAccess 且无 PENDING 申请", async () => {
    setSession("user2", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user2", dcrAccess: false, phone: "13800138000", quizPassed: true });
    mockAppFindFirst.mockResolvedValue(null); // no pending application
    mockAppCreate.mockResolvedValue({ id: "app-auto" });

    const now = new Date();
    mockCaseCreate.mockResolvedValue({
      id: "case2",
      category: "TUTORING",
      formData: {},
      status: "OPENED",
      pledgeText: "服务端声明",
      submitterId: "user2",
      handlerId: null,
      createdAt: now,
      updatedAt: now,
      submitter: { id: "user2", nickname: "用户2" },
      timeline: [],
    });

    const { POST } = await import("../route");
    const res = await POST(
      makePostRequest(validRequest),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockAppCreate).toHaveBeenCalledWith({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText: expect.stringContaining("【生成时间】"),
        applicantId: "user2",
        caseId: "case2",
      },
    });
  });

  it("已有 PENDING 申请时应拒绝创建新的首次准入委托", async () => {
    setSession("user3", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user3", dcrAccess: false, phone: "13800138000", quizPassed: true });
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
      makePostRequest(validRequest),
      { params: {} },
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPLICATION_ALREADY_PENDING");
    expect(mockCaseCreate).not.toHaveBeenCalled();
    expect(mockAppCreate).not.toHaveBeenCalled();
  });

  it("创建前会修复关联已驳回委托的历史待审申请", async () => {
    setSession("user5", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user5", dcrAccess: false, phone: "13800138000", quizPassed: true });
    mockAppUpdateMany.mockResolvedValue({ count: 1 });
    mockAppFindFirst.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({ id: "new-app" });
    mockCaseCreate.mockResolvedValue({
      id: "case5", category: "TUTORING", status: "OPENED", submitterId: "user5",
      submitter: { id: "user5", nickname: "用户5" }, timeline: [],
    });
    const { POST } = await import("../route");
    const response = await POST(makePostRequest(validRequest), { params: {} });
    expect(response.status).toBe(201);
    expect(mockAppUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ applicantId: "user5", status: "PENDING", case_: { requestStatus: "REJECTED" } }),
      data: expect.objectContaining({ status: "REJECTED" }),
    }));
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
      makePostRequest(validRequest),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockAppFindFirst).not.toHaveBeenCalled();
    expect(mockAppCreate).not.toHaveBeenCalled();
  });

  it("requires canonical fields and all three confirmations", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: true });

    const { POST } = await import("../route");
    const missingFields = await POST(makePostRequest({ category: "TUTORING", formData: {} }), { params: {} });
    const missingConfirmation = await POST(makePostRequest({
      ...validRequest,
      formData: { ...validRequest.formData, confirmations: [true, true, false] },
    }), { params: {} });

    expect(missingFields.status).toBe(400);
    expect(missingConfirmation.status).toBe(400);
    expect(mockCaseCreate).not.toHaveBeenCalled();
  });

  it("rejects category and content type mismatches", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: true });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ ...validRequest, category: "OTHER" }), { params: {} });

    expect(res.status).toBe(400);
    expect(mockCaseCreate).not.toHaveBeenCalled();
  });

  it("ignores client pledge text and stores a server-generated pledge", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: true });
    mockCaseCreate.mockResolvedValue({ id: "case1", status: "OPENED", category: "TUTORING" });

    const { POST } = await import("../route");
    const res = await POST(makePostRequest({ ...validRequest, pledgeText: "伪造时间" }), { params: {} });

    expect(res.status).toBe(201);
    expect(mockCaseCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pledgeText: expect.stringContaining("【生成时间】") }),
    }));
    expect(mockCaseCreate.mock.calls[0][0].data.pledgeText).not.toContain("伪造时间");
  });

  it("blocks sensitive matches with a stable 422 code", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: true });
    vi.mocked(scanContent).mockResolvedValueOnce([{ word: "测试", category: "PII", severity: "HIGH", start: 0, end: 2 }] as never);

    const { POST } = await import("../route");
    const res = await POST(makePostRequest(validRequest), { params: {} });

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("SENSITIVE_CONTENT");
    expect(mockCaseCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the sensitive scanner errors", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ id: "user1", dcrAccess: true });
    vi.mocked(scanContent).mockRejectedValueOnce(new Error("scanner unavailable"));

    const { POST } = await import("../route");
    const res = await POST(makePostRequest(validRequest), { params: {} });

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("SENSITIVE_SCAN_FAILED");
    expect(mockCaseCreate).not.toHaveBeenCalled();
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

  it("Moderator 使用审核状态筛选时可以查看完整委托审核队列", async () => {
    setSession("moderator1", "MODERATOR");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
    mockCaseFindMany.mockResolvedValue([]);
    mockCaseCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ requestStatus: "PENDING" }), { params: {} });

    expect(res.status).toBe(200);
    const findManyCall = mockCaseFindMany.mock.calls[0][0];
    expect(findManyCall.where).toEqual({ requestStatus: "PENDING" });
  });

  it("Helper 可读取已审核待接委托的脱敏摘要", async () => {
    setSession("helper1", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrHelperAccess: true });
    mockCaseFindMany.mockResolvedValue([{ id: "case-open", category: "TUTORING", status: "OPENED", requestStatus: "APPROVED", createdAt: new Date() }]);
    mockCaseCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ scope: "claimable" }), { params: {} });

    expect(res.status).toBe(200);
    const call = mockCaseFindMany.mock.calls[0][0];
    expect(call.where.AND).toEqual([
      { requestStatus: "APPROVED" },
      { status: "OPENED" },
      { submitterId: { not: "helper1" } },
      { handlers: { none: { userId: "helper1" } } },
    ]);
    expect(call.select.formData).toBeUndefined();
    expect(call.select.pledgeText).toBeUndefined();
    expect(call.select.extractedFields).toBeUndefined();
  });

  it("普通用户不能读取待接委托池", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrHelperAccess: false });

    const { GET } = await import("../route");
    const res = await GET(makeGetRequest({ scope: "claimable" }), { params: {} });

    expect(res.status).toBe(403);
    expect(mockCaseFindMany).not.toHaveBeenCalled();
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

  it("有 dcrAccess 用户只能看到自己的委托和已审核通过的已分配委托", async () => {
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
          { submitterId: "dcr-user2" },
          { AND: [
            { handlers: { some: { userId: "dcr-user2" } } },
            { requestStatus: "APPROVED" },
          ] },
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
    // Verify ownership/approval constraints remain in AND and status is also applied.
    const findManyCall = mockCaseFindMany.mock.calls[0][0];
    expect(findManyCall.where.AND).toEqual([
      {
        OR: [
          { submitterId: "dcr-user3" },
          { AND: [
            { handlers: { some: { userId: "dcr-user3" } } },
            { requestStatus: "APPROVED" },
          ] },
        ],
      },
    ]);
    expect(findManyCall.where.status).toBe("OPENED");
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
