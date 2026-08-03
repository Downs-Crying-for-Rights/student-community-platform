import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockPostUpdateMany = vi.fn();
const mockNotificationCreate = vi.fn();
const mockRevisionFindFirst = vi.fn();
const mockRevisionUpdate = vi.fn();
const mockRevisionUpdateMany = vi.fn();
const mockPostEditHistoryCreate = vi.fn();
const mockPostTagDeleteMany = vi.fn();
const mockPostTagCreateMany = vi.fn();
const mockSendUserMail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
      updateMany: (...args: unknown[]) => mockPostUpdateMany(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    postRevision: { findFirst: (...args: unknown[]) => mockRevisionFindFirst(...args) },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      post: {
        update: (...args: unknown[]) => mockPostUpdate(...args),
        updateMany: (...args: unknown[]) => mockPostUpdateMany(...args),
      },
      postRevision: {
        update: (...args: unknown[]) => mockRevisionUpdate(...args),
        updateMany: (...args: unknown[]) => mockRevisionUpdateMany(...args),
      },
      postEditHistory: { create: (...args: unknown[]) => mockPostEditHistoryCreate(...args) },
      postTag: {
        deleteMany: (...args: unknown[]) => mockPostTagDeleteMany(...args),
        createMany: (...args: unknown[]) => mockPostTagCreateMany(...args),
      },
      auditLog: { create: vi.fn() },
    }),
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: {
    CONTENT_APPROVE: "CONTENT_APPROVE",
    POST_REVISION_APPROVE: "POST_REVISION_APPROVE",
  },
  AuditTargetType: { POST: "POST" },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/mail", () => ({
  sendUserMail: (...args: unknown[]) => mockSendUserMail(...args),
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/moderation/p1/approve", {
    method: "POST",
  });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== POST /api/moderation/[id]/approve Tests ====================

describe("POST /api/moderation/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRevisionFindFirst.mockResolvedValue(null);
    mockPostUpdateMany.mockResolvedValue({ count: 1 });
    mockRevisionUpdateMany.mockResolvedValue({ count: 1 });
    mockSendUserMail.mockResolvedValue({ status: "SENT" });
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(401);
  });

  it("应返回 403 当普通用户操作", async () => {
    setSession("user1", "USER");
    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(403);
  });

  it("应返回 404 当帖子不存在", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue(null);

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "nonexistent" } });
    expect(res.status).toBe(404);
  });

  it("应返回 400 当帖子不是 PENDING 状态", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      title: "已发布帖子",
      authorId: "u1",
    });

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("只能审核待审核状态的帖子");
  });

  it("应成功批准帖子", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockPostUpdate.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      title: "待审核帖子",
    });
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.status).toBe("PUBLISHED");
  });

  it("应为帖子作者创建通知", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../moderation/[id]/approve/route");
    await POST(makeRequest(), { params: { id: "p1" } });

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "SYSTEM",
        title: "帖子审核通过",
        userId: "u1",
        link: "/post/p1",
      }),
    });
  });

  it("应记录审计日志", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../moderation/[id]/approve/route");
    await POST(makeRequest(), { params: { id: "p1" } });

    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "CONTENT_APPROVE",
      "POST",
      "p1",
      expect.objectContaining({
        previousStatus: "PENDING",
        newStatus: "PUBLISHED",
        title: "待审核帖子",
      }),
      undefined,
      expect.objectContaining({ post: expect.any(Object), auditLog: expect.any(Object) }),
    );
  });

  it("应批准待审修订并将修订内容更新到公开帖子", async () => {
    setSession("mod1", "MODERATOR");
    const baseUpdatedAt = new Date("2026-07-19T00:00:00.000Z");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PUBLISHED",
      title: "原标题",
      content: "原内容",
      authorId: "u1",
      updatedAt: baseUpdatedAt,
    });
    mockRevisionFindFirst.mockResolvedValue({
      id: "revision1",
      title: "修订标题",
      content: "修订内容",
      summary: "修订摘要",
      images: ["revision.png"],
      visibility: "PUBLIC",
      tagIds: ["tag1"],
      status: "PENDING",
      baseUpdatedAt,
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", title: "修订标题", status: "PUBLISHED" });
    mockNotificationCreate.mockResolvedValue({});

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.post.title).toBe("修订标题");
    expect(mockPostEditHistoryCreate).toHaveBeenCalledWith({
      data: { postId: "p1", oldTitle: "原标题", oldContent: "原内容" },
    });
    expect(mockPostUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "p1", updatedAt: baseUpdatedAt }),
      data: expect.objectContaining({ title: "修订标题", content: "修订内容", status: "PUBLISHED" }),
    }));
    expect(mockRevisionUpdateMany).toHaveBeenCalledWith({
      where: { id: "revision1", status: "PENDING" },
      data: expect.objectContaining({ status: "APPROVED", reviewerId: "mod1" }),
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      "mod1",
      "POST_REVISION_APPROVE",
      "POST",
      "p1",
      { revisionId: "revision1" },
      undefined,
      expect.objectContaining({ postRevision: expect.any(Object) }),
    );
  });

  it("Admin 也应能批准帖子", async () => {
    setSession("admin1", "ADMIN");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockPostUpdate.mockResolvedValue({ id: "p1", status: "PUBLISHED" });
    mockNotificationCreate.mockResolvedValue({});
    mockLogAudit.mockResolvedValue({});

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });
    expect(res.status).toBe(200);
  });

  it("并发审核未抢到待审状态时返回 409 且不发送通知", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockPostUpdateMany.mockResolvedValueOnce({ count: 0 });

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });

    expect(res.status).toBe(409);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("通知失败不应推翻已完成的审核结果", async () => {
    setSession("mod1", "MODERATOR");
    mockPostFindUnique.mockResolvedValue({
      id: "p1",
      status: "PENDING",
      title: "待审核帖子",
      authorId: "u1",
    });
    mockNotificationCreate.mockRejectedValueOnce(new Error("notification unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { POST } = await import("../../moderation/[id]/approve/route");
    const res = await POST(makeRequest(), { params: { id: "p1" } });

    expect(res.status).toBe(200);
    expect((await res.json()).post.status).toBe("PUBLISHED");
    consoleError.mockRestore();
  });
});
