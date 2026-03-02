import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockReportCreate = vi.fn();
const mockReportFindFirst = vi.fn();
const mockReportFindMany = vi.fn();
const mockReportCount = vi.fn();
const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockCommentFindUnique = vi.fn();
const mockCommentUpdate = vi.fn();
const mockUserFindMany = vi.fn();
const mockNotificationCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    report: {
      create: (...args: unknown[]) => mockReportCreate(...args),
      findFirst: (...args: unknown[]) => mockReportFindFirst(...args),
      findMany: (...args: unknown[]) => mockReportFindMany(...args),
      count: (...args: unknown[]) => mockReportCount(...args),
    },
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    comment: {
      findUnique: (...args: unknown[]) => mockCommentFindUnique(...args),
      update: (...args: unknown[]) => mockCommentUpdate(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    notification: {
      createMany: (...args: unknown[]) => mockNotificationCreateMany(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { REPORT_RESOLVE: "REPORT_RESOLVE", REPORT_DISMISS: "REPORT_DISMISS" },
  AuditTargetType: { REPORT: "REPORT" },
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

function makeRequest(method: string, url?: string, body?: unknown): NextRequest {
  const fullUrl = url ?? "http://localhost:3000/api/reports";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(fullUrl, init);
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== POST /api/reports Tests ====================

describe("POST /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规内容",
        targetPostId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 400 当未指定举报目标", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, { reason: "违规内容" }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("必须指定举报目标（用户、帖子或评论）");
  });

  it("应返回 400 当举报自己", async () => {
    const selfId = "clxxxxxxxxxxxxxxxxxx001";
    setSession(selfId, "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规内容",
        targetUserId: selfId,
      }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("不能举报自己");
  });

  it("应返回 409 当重复举报", async () => {
    setSession("user1", "USER");
    mockReportFindFirst.mockResolvedValue({ id: "existing-report" });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规内容",
        targetPostId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("您已举报过该内容");
  });

  it("应成功创建举报", async () => {
    setSession("user1", "USER");
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCount.mockResolvedValue(1); // below threshold
    const createdReport = {
      id: "r1",
      reason: "违规内容",
      status: "PENDING",
      reporterId: "user1",
      targetPostId: "clxxxxxxxxxxxxxxxxxx001",
    };
    mockReportCreate.mockResolvedValue(createdReport);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规内容",
        targetPostId: "clxxxxxxxxxxxxxxxxxx001",
      }),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.report).toEqual(createdReport);
    expect(mockReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "违规内容",
          status: "PENDING",
          reporterId: "user1",
          targetPostId: "clxxxxxxxxxxxxxxxxxx001",
        }),
      }),
    );
  });

  it("应在帖子被 3 人以上举报时自动隐藏并通知 Moderator", async () => {
    const postId = "clxxxxxxxxxxxxxxxxxx010";
    setSession("user3", "USER");
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCreate.mockResolvedValue({
      id: "r3",
      reason: "违规",
      status: "PENDING",
      reporterId: "user3",
      targetPostId: postId,
    });
    // 3 reports on this post (threshold met)
    mockReportCount.mockResolvedValue(3);
    mockPostFindUnique.mockResolvedValue({ id: postId, status: "PUBLISHED" });
    mockPostUpdate.mockResolvedValue({});
    mockUserFindMany.mockResolvedValue([{ id: "mod1" }]);
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规",
        targetPostId: postId,
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: postId },
        data: { status: "DELETED" },
      }),
    );
    expect(mockNotificationCreateMany).toHaveBeenCalled();
  });

  it("应在评论被 3 人以上举报时自动隐藏", async () => {
    const commentId = "clxxxxxxxxxxxxxxxxxx020";
    setSession("user3", "USER");
    mockReportFindFirst.mockResolvedValue(null);
    mockReportCreate.mockResolvedValue({
      id: "r4",
      reason: "违规评论",
      status: "PENDING",
      reporterId: "user3",
      targetCommentId: commentId,
    });
    mockReportCount.mockResolvedValue(3);
    mockCommentFindUnique.mockResolvedValue({ id: commentId, isDeleted: false });
    mockCommentUpdate.mockResolvedValue({});
    mockUserFindMany.mockResolvedValue([{ id: "mod1" }]);
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, {
        reason: "违规评论",
        targetCommentId: commentId,
      }),
      { params: {} },
    );

    expect(res.status).toBe(201);
    expect(mockCommentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: commentId },
        data: { isDeleted: true },
      }),
    );
  });

  it("应返回 400 当参数校验失败", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest("POST", undefined, { reason: "" }),
      { params: {} },
    );
    expect(res.status).toBe(400);
  });
});

// ==================== GET /api/reports Tests ====================

describe("GET /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Moderator 用户访问", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(403);
  });

  it("应返回举报列表（Moderator）", async () => {
    setSession("mod1", "MODERATOR");
    const reports = [
      {
        id: "r1",
        reason: "违规",
        status: "PENDING",
        reporter: { id: "user1", nickname: "用户1" },
        targetUser: null,
        targetPost: { id: "p1", title: "帖子1", status: "PUBLISHED" },
        targetComment: null,
      },
    ];
    mockReportFindMany.mockResolvedValue(reports);
    mockReportCount.mockResolvedValue(1);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reports).toEqual(reports);
    expect(data.total).toBe(1);
  });

  it("应支持按状态筛选", async () => {
    setSession("mod1", "MODERATOR");
    mockReportFindMany.mockResolvedValue([]);
    mockReportCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const url = "http://localhost:3000/api/reports?status=PENDING";
    const res = await GET(makeRequest("GET", url), { params: {} });

    expect(res.status).toBe(200);
    expect(mockReportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });

  it("应返回 200 给 Admin 用户", async () => {
    setSession("admin1", "ADMIN");
    mockReportFindMany.mockResolvedValue([]);
    mockReportCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(200);
  });
});
