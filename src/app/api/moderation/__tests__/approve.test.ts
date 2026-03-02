import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockPostFindUnique = vi.fn();
const mockPostUpdate = vi.fn();
const mockNotificationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    post: {
      findUnique: (...args: unknown[]) => mockPostFindUnique(...args),
      update: (...args: unknown[]) => mockPostUpdate(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

const mockLogAudit = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
  AuditAction: { CONTENT_APPROVE: "CONTENT_APPROVE" },
  AuditTargetType: { POST: "POST" },
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
});
