import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

// ==================== Mocks ====================

const mockCaseFindUnique = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: {
      findUnique: (...args: unknown[]) => mockCaseFindUnique(...args),
    },
    message: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      create: (...args: unknown[]) => mockMessageCreate(...args),
    },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Generators ====================

/** Roles that should NOT have access to a case (not submitter, not handler, not ADMIN) */
const nonAdminRoles = ["USER", "DCR_HELPER", "PSYCH_COUNSELOR"] as const;

/** All case statuses */
const allStatuses = ["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"] as const;

/** Statuses that allow sending messages */
const activeStatuses = ["IN_PROGRESS", "NEED_MORE_INFO"] as const;

/** Statuses that always forbid sending messages for any participant */
const alwaysBlockedStatuses = ["CLOSED"] as const;

/** Generate a unique user ID */
function arbUserId() {
  return fc.stringMatching(/^user-[a-z0-9]{4,12}$/);
}

/** Generate valid message content (1-2000 chars) */
function arbValidContent() {
  return fc.string({ minLength: 1, maxLength: 100 });
}

/** Generate content that exceeds 2000 chars */
function arbOverlongContent() {
  return fc.integer({ min: 2001, max: 2500 }).map((len) => "x".repeat(len));
}

/** Generate a set of distinct user IDs for submitter, handler, admin, and outsider */
function arbDistinctUsers() {
  return fc
    .tuple(arbUserId(), arbUserId(), arbUserId(), arbUserId())
    .filter(([a, b, c, d]) => {
      const set = new Set([a, b, c, d]);
      return set.size === 4;
    })
    .map(([submitterId, handlerId, adminId, outsiderId]) => ({
      submitterId,
      handlerId,
      adminId,
      outsiderId,
    }));
}

// ==================== Helpers ====================

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}/messages`, {
    method: "GET",
  });
}

function makePostRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}/messages`, {
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

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) } as never);


// ==================== Property 5: 消息 API 访问控制 ====================
// Feature: dcr-complete-ui, Property 5: 消息 API 访问控制
// **Validates: Requirements 3.2, 3.3, 3.4**

describe("Property 5: 消息 API 访问控制 — only submitter/handler/ADMIN can access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未认证用户访问返回 401", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (caseId) => {
        vi.clearAllMocks();
        mockGetServerSession.mockResolvedValue(null);

        const { GET } = await import("../[id]/messages/route");
        const res = await GET(makeGetRequest(caseId), makeContext(caseId));
        expect(res.status).toBe(401);
      }),
      { numRuns: 100 },
    );
  });

  it("提交者/处理者/ADMIN 可以访问消息", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        fc.constantFrom(...activeStatuses),
        fc.constantFrom("submitter", "handler", "admin") as fc.Arbitrary<string>,
        async (users, status, accessorType) => {
          vi.clearAllMocks();

          const caseRecord = {
            id: "case-test",
            status,
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          if (accessorType === "submitter") {
            setSession(users.submitterId, "USER");
          } else if (accessorType === "handler") {
            setSession(users.handlerId, "DCR_HELPER");
          } else {
            setSession(users.adminId, "ADMIN");
          }

          mockCaseFindUnique.mockResolvedValue(caseRecord);
          mockMessageFindMany.mockResolvedValue([]);

          const { GET } = await import("../[id]/messages/route");
          const res = await GET(makeGetRequest("case-test"), makeContext("case-test"));
          expect(res.status).toBe(200);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("无关用户访问返回 403", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        fc.constantFrom(...nonAdminRoles),
        async (users, role) => {
          vi.clearAllMocks();

          const caseRecord = {
            id: "case-test",
            status: "IN_PROGRESS",
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          // outsider is neither submitter nor handler
          setSession(users.outsiderId, role);
          mockCaseFindUnique.mockResolvedValue(caseRecord);

          const { GET } = await import("../[id]/messages/route");
          const res = await GET(makeGetRequest("case-test"), makeContext("case-test"));
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 6: 消息创建字段自动赋值 ====================
// Feature: dcr-complete-ui, Property 6: 消息创建字段自动赋值
// **Validates: Requirements 2.4, 3.6**

describe("Property 6: 消息创建字段自动赋值 — senderId/receiverId/caseId/isAnonymous auto-set", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("提交者发送时 senderId=提交者, receiverId=处理者, isAnonymous=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        arbValidContent(),
        fc.constantFrom(...activeStatuses),
        async (users, content, status) => {
          vi.clearAllMocks();

          const caseId = "case-prop6";
          const caseRecord = {
            id: caseId,
            status,
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          setSession(users.submitterId, "USER");
          mockCaseFindUnique.mockResolvedValue(caseRecord);
          mockMessageCreate.mockResolvedValue({
            id: "m1",
            content,
            isAnonymous: true,
            senderId: users.submitterId,
            createdAt: new Date(),
          });

          const { POST } = await import("../[id]/messages/route");
          const res = await POST(makePostRequest(caseId, { content }), makeContext(caseId));

          expect(res.status).toBe(201);
          expect(mockMessageCreate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                senderId: users.submitterId,
                receiverId: users.handlerId,
                caseId,
                isAnonymous: true,
              }),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("处理者发送时 senderId=处理者, receiverId=提交者, isAnonymous=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        arbValidContent(),
        fc.constantFrom(...activeStatuses),
        async (users, content, status) => {
          vi.clearAllMocks();

          const caseId = "case-prop6b";
          const caseRecord = {
            id: caseId,
            status,
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          setSession(users.handlerId, "DCR_HELPER");
          mockCaseFindUnique.mockResolvedValue(caseRecord);
          mockMessageCreate.mockResolvedValue({
            id: "m1",
            content,
            isAnonymous: true,
            senderId: users.handlerId,
            createdAt: new Date(),
          });

          const { POST } = await import("../[id]/messages/route");
          const res = await POST(makePostRequest(caseId, { content }), makeContext(caseId));

          expect(res.status).toBe(201);
          expect(mockMessageCreate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                senderId: users.handlerId,
                receiverId: users.submitterId,
                caseId,
                isAnonymous: true,
              }),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ADMIN 发送时 senderId=ADMIN, receiverId=提交者, isAnonymous=true", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        arbValidContent(),
        fc.constantFrom(...activeStatuses),
        async (users, content, status) => {
          vi.clearAllMocks();

          const caseId = "case-prop6c";
          const caseRecord = {
            id: caseId,
            status,
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          setSession(users.adminId, "ADMIN");
          mockCaseFindUnique.mockResolvedValue(caseRecord);
          mockMessageCreate.mockResolvedValue({
            id: "m1",
            content,
            isAnonymous: true,
            senderId: users.adminId,
            createdAt: new Date(),
          });

          const { POST } = await import("../[id]/messages/route");
          const res = await POST(makePostRequest(caseId, { content }), makeContext(caseId));

          expect(res.status).toBe(201);
          expect(mockMessageCreate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                senderId: users.adminId,
                receiverId: users.submitterId,
                caseId,
                isAnonymous: true,
              }),
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ==================== Property 7: 消息内容长度校验 ====================
// Feature: dcr-complete-ui, Property 7: 消息内容长度校验
// **Validates: Requirements 3.5**

describe("Property 7: 消息内容长度校验 — content > 2000 chars returns 400", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("超过 2000 字符的 content 返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(arbOverlongContent(), async (content) => {
        vi.clearAllMocks();

        setSession("user1", "USER");

        const { POST } = await import("../[id]/messages/route");
        const res = await POST(
          makePostRequest("case1", { content }),
          makeContext("case1"),
        );
        expect(res.status).toBe(400);
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 8: 非活跃状态禁止发送消息 ====================
// Feature: dcr-complete-ui, Property 8: 非活跃状态禁止发送消息
// **Validates: Requirements 3.5, 3.7**
// Updated for bugfix: OPENED now allows submitter to send (2.8), only CLOSED always blocks

describe("Property 8: 非活跃状态禁止发送消息 — CLOSED returns 400, OPENED blocks non-submitter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CLOSED 状态发送消息返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        arbValidContent(),
        async (users, content) => {
          vi.clearAllMocks();

          const caseId = "case-prop8a";
          const caseRecord = {
            id: caseId,
            status: "CLOSED",
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          // Use submitter so access control passes
          setSession(users.submitterId, "USER");
          mockCaseFindUnique.mockResolvedValue(caseRecord);

          const { POST } = await import("../[id]/messages/route");
          const res = await POST(
            makePostRequest(caseId, { content }),
            makeContext(caseId),
          );
          const data = await res.json();

          expect(res.status).toBe(400);
          expect(data.error).toBe("当前状态不允许发送消息");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("OPENED 状态非提交者发送消息返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctUsers(),
        arbValidContent(),
        async (users, content) => {
          vi.clearAllMocks();

          const caseId = "case-prop8b";
          const caseRecord = {
            id: caseId,
            status: "OPENED",
            submitterId: users.submitterId,
            handlerId: users.handlerId,
            handlers: [{ userId: users.handlerId }],
          };

          // Use handler (non-submitter) — should be blocked in OPENED
          setSession(users.handlerId, "DCR_HELPER");
          mockCaseFindUnique.mockResolvedValue(caseRecord);

          const { POST } = await import("../[id]/messages/route");
          const res = await POST(
            makePostRequest(caseId, { content }),
            makeContext(caseId),
          );
          const data = await res.json();

          expect(res.status).toBe(400);
          expect(data.error).toContain("OPENED");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 9: 消息列表按时间升序排列 ====================
// Feature: dcr-complete-ui, Property 9: 消息列表按时间升序排列
// **Validates: Requirements 2.5, 3.1**

describe("Property 9: 消息列表按时间升序排列 — messages ordered by createdAt asc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 返回的消息按 createdAt 升序排列", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.integer({ min: 1704067200000, max: 1767225600000 }).map((ts) => new Date(ts)),
          { minLength: 1, maxLength: 10 },
        ),
        async (dates) => {
          vi.clearAllMocks();

          const caseId = "case-prop9";
          const caseRecord = {
            id: caseId,
            status: "IN_PROGRESS",
            submitterId: "user1",
            handlerId: "helper1",
            handlers: [{ userId: "helper1" }],
          };

          setSession("user1", "USER");
          mockCaseFindUnique.mockResolvedValue(caseRecord);

          // Simulate prisma returning messages sorted by createdAt asc
          const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
          const messages = sortedDates.map((d, i) => ({
            id: `m${i}`,
            content: `msg-${i}`,
            isAnonymous: true,
            senderId: "user1",
            createdAt: d,
          }));
          mockMessageFindMany.mockResolvedValue(messages);

          const { GET } = await import("../[id]/messages/route");
          const res = await GET(makeGetRequest(caseId), makeContext(caseId));
          const data = await res.json();

          expect(res.status).toBe(200);

          // Verify messages are in ascending order
          const returnedDates = data.messages.map(
            (m: { createdAt: string }) => new Date(m.createdAt).getTime(),
          );
          for (let i = 1; i < returnedDates.length; i++) {
            expect(returnedDates[i]).toBeGreaterThanOrEqual(returnedDates[i - 1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("prisma.message.findMany 使用 orderBy createdAt asc", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (caseId) => {
        vi.clearAllMocks();

        const caseRecord = {
          id: caseId,
          status: "IN_PROGRESS",
          submitterId: "user1",
          handlerId: "helper1",
          handlers: [{ userId: "helper1" }],
        };

        setSession("user1", "USER");
        mockCaseFindUnique.mockResolvedValue(caseRecord);
        mockMessageFindMany.mockResolvedValue([]);

        const { GET } = await import("../[id]/messages/route");
        await GET(makeGetRequest(caseId), makeContext(caseId));

        expect(mockMessageFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { caseId },
            orderBy: { createdAt: "asc" },
          }),
        );
      }),
      { numRuns: 100 },
    );
  });
});
