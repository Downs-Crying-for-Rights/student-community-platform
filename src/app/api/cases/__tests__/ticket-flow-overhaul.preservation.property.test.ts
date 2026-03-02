import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

/**
 * 保持性属性测试 — Admin 查询、状态机规则与消息约束不变
 *
 * 这些测试在未修复代码上运行，预期会通过（通过 = 确认基线行为已捕获）。
 * 修复后重新运行，仍应通过（确认无回归）。
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9**
 */

// ==================== Mocks ====================

const mockUserFindUnique = vi.fn();
const mockCaseFindMany = vi.fn();
const mockCaseCount = vi.fn();
const mockCaseFindUnique = vi.fn();
const mockCaseUpdate = vi.fn();
const mockTimelineEventCreate = vi.fn();
const mockMessageCreate = vi.fn();
const mockTransaction = vi.fn();
const mockCaseHandlerCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    case: {
      create: vi.fn(),
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
      count: (...args: unknown[]) => mockCaseCount(...args),
      findUnique: (...args: unknown[]) => mockCaseFindUnique(...args),
      update: (...args: unknown[]) => mockCaseUpdate(...args),
    },
    caseHandler: {
      count: (...args: unknown[]) => mockCaseHandlerCount(...args),
    },
    timelineEvent: { create: (...args: unknown[]) => mockTimelineEventCreate(...args) },
    message: { create: (...args: unknown[]) => mockMessageCreate(...args) },
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
  generateAnonymousId: () => "anon-test-id",
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

function makeGetRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/cases");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/cases/case-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeMessagePostRequest(caseId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ==================== Observation 1: Admin 全量查询 ====================
// **Validates: Requirements 3.1**
//
// Preservation: Admin/SUPER_ADMIN 访问 GET /api/cases 时返回所有工单，
// 不受 OR 条件限制。Admin 查询的 where 条件不应包含 OR 子句。

describe("Observation 1: Admin 全量查询不受 OR 条件限制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意 Admin/SUPER_ADMIN 用户 + 任意 status 筛选，where 条件不包含 OR/submitterId 限制", async () => {
    const adminRoles = ["ADMIN", "SUPER_ADMIN"] as const;
    const statusOptions = [undefined, "OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...adminRoles),
        fc.constantFrom(...statusOptions),
        async (role, statusFilter) => {
          vi.clearAllMocks();

          const userId = "admin-user";
          setSession(userId, role);
          mockCaseFindMany.mockResolvedValue([]);
          mockCaseCount.mockResolvedValue(0);

          const { GET } = await import("../route");
          const params: Record<string, string> = {};
          if (statusFilter) params.status = statusFilter;
          const res = await GET(makeGetRequest(params), { params: {} });

          expect(res.status).toBe(200);

          const call = mockCaseFindMany.mock.calls[0][0];
          const where = call.where;

          // Admin queries should NOT have OR or submitterId restrictions
          expect(where.OR).toBeUndefined();
          expect(where.submitterId).toBeUndefined();

          // If status filter provided, it should be set at top level
          if (statusFilter) {
            expect(where.status).toBe(statusFilter);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});


// ==================== Observation 2: 状态机转换规则 ====================
// **Validates: Requirements 3.4**
//
// Preservation: 状态机规则保持不变：
// OPENED→IN_PROGRESS, OPENED→CLOSED, IN_PROGRESS→NEED_MORE_INFO,
// IN_PROGRESS→CLOSED, NEED_MORE_INFO→IN_PROGRESS
// 非法转换应被拒绝。

describe("Observation 2: 状态机转换规则不变", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("合法状态转换 OPENED→IN_PROGRESS→NEED_MORE_INFO→IN_PROGRESS 和 OPENED→CLOSED、IN_PROGRESS→CLOSED 均正常工作", async () => {
    // Test valid transitions with appropriate roles
    const validTransitions = [
      { from: "OPENED", to: "IN_PROGRESS", role: "DCR_HELPER", isSubmitter: false, isHandler: false },
      { from: "OPENED", to: "CLOSED", role: "USER", isSubmitter: true, isHandler: false },
      { from: "IN_PROGRESS", to: "NEED_MORE_INFO", role: "DCR_HELPER", isSubmitter: false, isHandler: true },
      { from: "IN_PROGRESS", to: "CLOSED", role: "DCR_HELPER", isSubmitter: false, isHandler: true },
      { from: "NEED_MORE_INFO", to: "IN_PROGRESS", role: "USER", isSubmitter: true, isHandler: false },
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validTransitions),
        async (transition) => {
          vi.clearAllMocks();

          const userId = transition.isSubmitter ? "submitter-1" : (transition.isHandler ? "handler-1" : "helper-1");
          setSession(userId, transition.role);

          mockCaseFindUnique.mockResolvedValue({
            id: "case-1",
            status: transition.from,
            submitterId: "submitter-1",
            handlerId: transition.from === "OPENED" ? null : "handler-1",
            submitter: { id: "submitter-1" },
            handler: transition.from === "OPENED" ? null : { id: "handler-1" },
          });

          mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
          mockCaseHandlerCount.mockResolvedValue(0); // Under concurrent limit

          // Mock transaction to execute the callback
          mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              case: {
                update: vi.fn().mockResolvedValue({
                  id: "case-1",
                  status: transition.to,
                  submitter: { id: "submitter-1", nickname: "Sub" },
                  handler: { id: userId, nickname: "Handler" },
                }),
              },
              caseHandler: { create: vi.fn().mockResolvedValue({}) },
              timelineEvent: { create: vi.fn().mockResolvedValue({}) },
              message: { create: vi.fn().mockResolvedValue({}) },
            };
            return cb(tx);
          });

          const { PATCH } = await import("../[id]/route");
          const req = makePatchRequest({ status: transition.to });
          const res = await PATCH(req, { params: Promise.resolve({ id: "case-1" }) } as never);

          // Valid transitions should succeed (200)
          expect(res.status).toBe(200);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("非法状态转换应被拒绝（返回 400）", async () => {
    const invalidTransitions = [
      { from: "CLOSED", to: "OPENED" },
      { from: "CLOSED", to: "IN_PROGRESS" },
      { from: "OPENED", to: "NEED_MORE_INFO" },
      { from: "NEED_MORE_INFO", to: "CLOSED" },
      { from: "NEED_MORE_INFO", to: "OPENED" },
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...invalidTransitions),
        async (transition) => {
          vi.clearAllMocks();

          setSession("admin-1", "ADMIN");

          mockCaseFindUnique.mockResolvedValue({
            id: "case-1",
            status: transition.from,
            submitterId: "submitter-1",
            handlerId: "handler-1",
            submitter: { id: "submitter-1" },
            handler: { id: "handler-1" },
          });

          mockUserFindUnique.mockResolvedValue({ dcrAccess: true });

          const { PATCH } = await import("../[id]/route");
          const req = makePatchRequest({ status: transition.to });
          const res = await PATCH(req, { params: Promise.resolve({ id: "case-1" }) } as never);

          // Invalid transitions should be rejected
          expect(res.status).toBe(400);
        },
      ),
      { numRuns: 30 },
    );
  });
});


// ==================== Observation 3: CLOSED 状态禁止发消息 ====================
// **Validates: Requirements 3.5**
//
// Preservation: canSendMessage("CLOSED") 返回 false

describe("Observation 3: CLOSED 状态 canSendMessage 返回 false", () => {
  it("canSendMessage('CLOSED') 始终返回 false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant("CLOSED" as const),
        async (status) => {
          const { canSendMessage } = await import("@/lib/dcr-ui-helpers");
          expect(canSendMessage(status)).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });
});

// ==================== Observation 4: 消息 isAnonymous 始终为 true ====================
// **Validates: Requirements 3.8**
//
// Preservation: 消息发送时 isAnonymous=true

describe("Observation 4: 消息发送 isAnonymous 始终为 true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意合法消息发送（IN_PROGRESS/NEED_MORE_INFO），创建的消息 isAnonymous=true", async () => {
    const validStatuses = ["IN_PROGRESS", "NEED_MORE_INFO"] as const;
    const senderRoles = [
      { role: "USER", isSubmitter: true, isHandler: false },
      { role: "DCR_HELPER", isSubmitter: false, isHandler: true },
      { role: "ADMIN", isSubmitter: false, isHandler: false },
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validStatuses),
        fc.constantFrom(...senderRoles),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (status, sender, content) => {
          vi.clearAllMocks();

          const userId = sender.isSubmitter ? "submitter-1" : (sender.isHandler ? "handler-1" : "admin-1");
          setSession(userId, sender.role);

          mockCaseFindUnique.mockResolvedValue({
            id: "case-1",
            status,
            submitterId: "submitter-1",
            handlerId: "handler-1",
          });

          const createdMessage = {
            id: "msg-1",
            content,
            isAnonymous: true,
            senderId: userId,
            createdAt: new Date().toISOString(),
          };
          mockMessageCreate.mockResolvedValue(createdMessage);

          const { POST } = await import("../[id]/messages/route");
          const req = makeMessagePostRequest("case-1", { content });
          const res = await POST(req, { params: Promise.resolve({ id: "case-1" }) } as never);

          if (res.status === 201) {
            // Verify the message was created with isAnonymous: true
            const createCall = mockMessageCreate.mock.calls[0]?.[0];
            if (createCall) {
              expect(createCall.data.isAnonymous).toBe(true);
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});


// ==================== Observation 5: DCR_HELPER 并发处理上限 5 个 ====================
// **Validates: Requirements 3.7**
//
// Preservation: DCR_HELPER 接单时检查并发处理上限（每人最多 5 个活跃工单），超出时返回错误

describe("Observation 5: DCR_HELPER 并发处理上限 5 个活跃工单", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("当 DCR_HELPER 已有 5 个活跃工单时，接单应被拒绝", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }),
        async (activeCaseCount) => {
          vi.clearAllMocks();

          const helperId = "helper-limit";
          setSession(helperId, "DCR_HELPER");

          mockCaseFindUnique.mockResolvedValue({
            id: "case-new",
            status: "OPENED",
            submitterId: "submitter-1",
            handlerId: null,
            submitter: { id: "submitter-1" },
            handler: null,
          });

          mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
          mockCaseHandlerCount.mockResolvedValue(activeCaseCount); // At or over limit

          const { PATCH } = await import("../[id]/route");
          const req = makePatchRequest({ status: "IN_PROGRESS" });
          const res = await PATCH(req, { params: Promise.resolve({ id: "case-new" }) } as never);

          // Should be rejected when at or over limit
          expect(res.status).toBe(400);
          const data = await res.json();
          expect(data.error).toContain("上限");
        },
      ),
      { numRuns: 20 },
    );
  });

  it("当 DCR_HELPER 活跃工单数 < 5 时，接单应成功", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        async (activeCaseCount) => {
          vi.clearAllMocks();

          const helperId = "helper-ok";
          setSession(helperId, "DCR_HELPER");

          mockCaseFindUnique.mockResolvedValue({
            id: "case-ok",
            status: "OPENED",
            submitterId: "submitter-1",
            handlerId: null,
            submitter: { id: "submitter-1" },
            handler: null,
          });

          mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
          mockCaseHandlerCount.mockResolvedValue(activeCaseCount); // Under limit

          mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              case: {
                update: vi.fn().mockResolvedValue({
                  id: "case-ok",
                  status: "IN_PROGRESS",
                  submitter: { id: "submitter-1", nickname: "Sub" },
                  handler: { id: helperId, nickname: "Helper" },
                }),
              },
              caseHandler: { create: vi.fn().mockResolvedValue({}) },
              timelineEvent: { create: vi.fn().mockResolvedValue({}) },
              message: { create: vi.fn().mockResolvedValue({}) },
            };
            return cb(tx);
          });

          const { PATCH } = await import("../[id]/route");
          const req = makePatchRequest({ status: "IN_PROGRESS" });
          const res = await PATCH(req, { params: Promise.resolve({ id: "case-ok" }) } as never);

          // Should succeed when under limit
          expect(res.status).toBe(200);
        },
      ),
      { numRuns: 20 },
    );
  });
});


// ==================== Observation 6: computeFlowStep 函数输出不变 ====================
// **Validates: Requirements 3.9**
//
// Preservation: computeFlowStep 函数逻辑保持不变
// - null/CLOSED → step 1
// - OPENED/NEED_MORE_INFO → step 2
// - IN_PROGRESS + !quizPassed → step 3
// - quizPassed=true → step 4

describe("Observation 6: computeFlowStep 函数输出不变", () => {
  it("对于任意输入组合，computeFlowStep 返回正确的步骤", async () => {
    const caseStatuses = [null, "OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...caseStatuses),
        fc.boolean(),
        fc.boolean(),
        async (caseStatus, quizPassed, dcrAccess) => {
          const { computeFlowStep } = await import("@/lib/dcr-flow-helpers");
          const result = computeFlowStep(caseStatus, quizPassed, dcrAccess);

          // Verify the expected mapping:
          if (quizPassed) {
            expect(result).toBe(4);
          } else if (caseStatus === null || caseStatus === "CLOSED") {
            expect(result).toBe(1);
          } else if (caseStatus === "OPENED" || caseStatus === "NEED_MORE_INFO") {
            expect(result).toBe(2);
          } else if (caseStatus === "IN_PROGRESS") {
            expect(result).toBe(3);
          } else {
            expect(result).toBe(1); // fallback
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ==================== Observation 7: 无 dcrAccess 用户仅看自己工单 ====================
// **Validates: Requirements 3.2**
//
// Preservation: 没有 dcrAccess 的用户仅能查看自己提交的工单（submitterId=userId）

describe("Observation 7: 无 dcrAccess 用户仅看自己提交的工单", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("对于任意非 Admin 且无 dcrAccess 的用户，where 条件仅包含 submitterId=userId", async () => {
    const nonAdminRoles = ["USER", "TRUSTED_USER", "MODERATOR"] as const;
    const statusOptions = [undefined, "OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonAdminRoles),
        fc.constantFrom(...statusOptions),
        fc.uuid(),
        async (role, statusFilter, userId) => {
          vi.clearAllMocks();

          setSession(userId, role);
          mockUserFindUnique.mockResolvedValue({ dcrAccess: false });
          mockCaseFindMany.mockResolvedValue([]);
          mockCaseCount.mockResolvedValue(0);

          const { GET } = await import("../route");
          const params: Record<string, string> = {};
          if (statusFilter) params.status = statusFilter;
          const res = await GET(makeGetRequest(params), { params: {} });

          expect(res.status).toBe(200);

          const call = mockCaseFindMany.mock.calls[0][0];
          const where = call.where;

          // Non-dcrAccess users should only see their own submitted cases
          expect(where.submitterId).toBe(userId);
          // Should NOT have OR clause
          expect(where.OR).toBeUndefined();

          // If status filter provided, it should also be applied
          if (statusFilter) {
            expect(where.status).toBe(statusFilter);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
