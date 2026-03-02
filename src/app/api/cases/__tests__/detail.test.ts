import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockCaseFindUnique = vi.fn();
const mockCaseUpdate = vi.fn();
const mockCaseCount = vi.fn();
const mockTimelineEventCreate = vi.fn();
const mockMessageCreate = vi.fn();
const mockTransaction = vi.fn();
const mockUserFindUnique = vi.fn();
const mockCaseHandlerCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: {
      findUnique: (...args: unknown[]) => mockCaseFindUnique(...args),
      update: (...args: unknown[]) => mockCaseUpdate(...args),
      count: (...args: unknown[]) => mockCaseCount(...args),
    },
    caseHandler: {
      count: (...args: unknown[]) => mockCaseHandlerCount(...args),
    },
    timelineEvent: {
      create: (...args: unknown[]) => mockTimelineEventCreate(...args),
    },
    message: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_ACCESS: "CASE_ACCESS" },
  AuditTargetType: { CASE: "CASE" },
}));

vi.mock("@/lib/notification", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  generateAnonymousId: () => "匿名用户_TEST",
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}`, { method: "GET" });
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}`, {
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

const baseCaseRecord = {
  id: "case1",
  category: "TUTORING",
  formData: {},
  status: "OPENED",
  pledgeText: "声明",
  submitterId: "user1",
  handlerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  submitter: { id: "user1", nickname: "提交者" },
  handler: null,
  timeline: [],
};

// ==================== Tests ====================

describe("GET /api/cases/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(401);
  });

  it("应返回 404 当委托不存在", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(null);

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("nonexistent"), { params: Promise.resolve({ id: "nonexistent" }) } as never);
    expect(res.status).toBe(404);
  });

  it("应返回 403 当用户无权访问", async () => {
    setSession("other-user", "USER");
    mockCaseFindUnique.mockResolvedValue(baseCaseRecord);
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(403);
  });

  it("DCR_HELPER 可以查看 OPENED 状态的工单（用于决定是否接单）", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({ ...baseCaseRecord, status: "OPENED" });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(200);
  });

  it("有 dcrAccess 的用户可以查看 OPENED 状态的工单", async () => {
    setSession("moderator1", "MODERATOR");
    mockCaseFindUnique.mockResolvedValue({ ...baseCaseRecord, status: "OPENED" });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(200);
  });

  it("DCR_HELPER 无法查看非 OPENED 且非自己参与的工单", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "other-helper",
      handler: { id: "other-helper", nickname: "其他协助者" },
    });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(403);
  });

  it("提交者可以查看自己的委托", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(baseCaseRecord);

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.case.id).toBe("case1");
  });

  it("CaseHandler 关联表中的处理者可以查看工单（非主处理者）", async () => {
    setSession("helper2", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      handler: { id: "helper1", nickname: "主处理者" },
      handlers: [{ userId: "helper1" }, { userId: "helper2" }],
    });

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(200);
  });

  it("Admin 可以查看任何委托", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue(baseCaseRecord);

    const { GET } = await import("../[id]/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/cases/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "IN_PROGRESS" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    expect(res.status).toBe(401);
  });

  it("应返回 400 当状态转换不合法", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "CLOSED",
      submitter: { id: "user1" },
      handler: { id: "helper1" },
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "IN_PROGRESS" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("不允许");
  });

  it("DCRHelper 可以接单 (OPENED → IN_PROGRESS)", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "OPENED",
      submitter: { id: "user1" },
      handler: null,
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseHandlerCount.mockResolvedValue(2); // under limit of 5

    const updatedCase = {
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      handler: { id: "helper1", nickname: "协助者" },
      submitter: { id: "user1", nickname: "提交者" },
    };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        case: { update: vi.fn().mockResolvedValue(updatedCase) },
        caseHandler: { create: vi.fn() },
        timelineEvent: { create: vi.fn() },
        message: { create: vi.fn() },
      };
      return fn(tx);
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "IN_PROGRESS" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.case.status).toBe("IN_PROGRESS");
  });

  it("应返回 400 当 DCRHelper 已达到并发上限 5 个", async () => {
    setSession("helper1", "DCR_HELPER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "OPENED",
      submitter: { id: "user1" },
      handler: null,
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseHandlerCount.mockResolvedValue(5); // at limit

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "IN_PROGRESS" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("上限");
  });

  it("应返回 403 当非 DCRHelper 尝试接单", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "OPENED",
      submitter: { id: "user1" },
      handler: null,
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "IN_PROGRESS" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    expect(res.status).toBe(403);
  });

  it("提交者可以取消委托 (OPENED → CLOSED)", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "OPENED",
      submitter: { id: "user1" },
      handler: null,
    });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const updatedCase = {
      ...baseCaseRecord,
      status: "CLOSED",
      submitter: { id: "user1", nickname: "提交者" },
    };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        case: { update: vi.fn().mockResolvedValue(updatedCase) },
        caseHandler: { create: vi.fn() },
        timelineEvent: { create: vi.fn() },
        message: { create: vi.fn() },
      };
      return fn(tx);
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { status: "CLOSED" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.case.status).toBe("CLOSED");
  });
});

describe("PATCH /api/cases/[id] - JOIN action", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("DCRHelper 可以通过 JOIN 加入 OPENED 工单（转为 IN_PROGRESS）", async () => {
    setSession("helper1", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "OPENED",
      submitter: { id: "user1" },
      handler: null,
      handlers: [],
    });
    mockCaseHandlerCount.mockResolvedValue(0);

    const updatedCase = {
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      handler: { id: "helper1", nickname: "协助者" },
      submitter: { id: "user1", nickname: "提交者" },
    };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        case: { update: vi.fn().mockResolvedValue(updatedCase) },
        caseHandler: { create: vi.fn() },
        timelineEvent: { create: vi.fn() },
        message: { create: vi.fn() },
      };
      return fn(tx);
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.case.status).toBe("IN_PROGRESS");
  });

  it("DCRHelper 可以通过 JOIN 加入 IN_PROGRESS 工单（不改变状态）", async () => {
    setSession("helper2", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      submitter: { id: "user1" },
      handler: { id: "helper1" },
      handlers: [{ userId: "helper1" }],
    });
    mockCaseHandlerCount.mockResolvedValue(1);

    const updatedCase = {
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      handler: { id: "helper1", nickname: "协助者1" },
      submitter: { id: "user1", nickname: "提交者" },
    };

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        case: { update: vi.fn().mockResolvedValue(updatedCase) },
        caseHandler: { create: vi.fn() },
        timelineEvent: { create: vi.fn() },
        message: { create: vi.fn() },
      };
      return fn(tx);
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.case.status).toBe("IN_PROGRESS");
    expect(data.case.handlerId).toBe("helper1"); // handlerId unchanged
  });

  it("应返回 400 当工单处理者已达上限 5 人", async () => {
    setSession("helper6", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      submitter: { id: "user1" },
      handler: { id: "helper1" },
      handlers: [
        { userId: "helper1" },
        { userId: "helper2" },
        { userId: "helper3" },
        { userId: "helper4" },
        { userId: "helper5" },
      ],
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("上限");
  });

  it("应返回 400 当用户并发活跃工单已达上限 5 个", async () => {
    setSession("helper1", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "other-helper",
      submitter: { id: "user1" },
      handler: { id: "other-helper" },
      handlers: [{ userId: "other-helper" }],
    });
    mockCaseHandlerCount.mockResolvedValue(5); // at limit

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("上限");
  });

  it("应返回 400 当用户已是该工单的处理者", async () => {
    setSession("helper1", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "IN_PROGRESS",
      handlerId: "helper1",
      submitter: { id: "user1" },
      handler: { id: "helper1" },
      handlers: [{ userId: "helper1" }],
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("已是");
  });

  it("应返回 400 当工单状态为 CLOSED 时尝试 JOIN", async () => {
    setSession("helper1", "DCR_HELPER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue({
      ...baseCaseRecord,
      status: "CLOSED",
      submitter: { id: "user1" },
      handler: { id: "other-helper" },
      handlers: [{ userId: "other-helper" }],
    });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("不允许加入");
  });

  it("应返回 403 当非 DCRHelper 尝试 JOIN", async () => {
    setSession("user1", "USER");
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      makePatchRequest("case1", { action: "JOIN" }),
      { params: Promise.resolve({ id: "case1" }) } as never,
    );

    expect(res.status).toBe(403);
  });
});
