import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockNotificationFindMany = vi.fn();
const mockNotificationCount = vi.fn();
const mockNotificationFindUnique = vi.fn();
const mockNotificationUpdate = vi.fn();
const mockNotificationUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    notification: {
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
      count: (...args: unknown[]) => mockNotificationCount(...args),
      findUnique: (...args: unknown[]) => mockNotificationFindUnique(...args),
      update: (...args: unknown[]) => mockNotificationUpdate(...args),
      updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args),
    },
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

function makeRequest(method: string, url?: string, body?: unknown): NextRequest {
  const fullUrl = url ?? "http://localhost:3000/api/notifications";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(fullUrl, init);
}

function setSession(id: string, role = "USER") {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}


// ==================== GET /api/notifications Tests ====================

describe("GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("应返回用户通知列表（默认分页）", async () => {
    setSession("user1");
    const notifications = [
      { id: "n1", type: "COMMENT", title: "新评论", content: "内容", isRead: false, createdAt: new Date() },
      { id: "n2", type: "LIKE", title: "新点赞", content: "内容", isRead: true, createdAt: new Date() },
    ];
    mockNotificationFindMany.mockResolvedValue(notifications);
    mockNotificationCount
      .mockResolvedValueOnce(2)   // total
      .mockResolvedValueOnce(1);  // unreadCount

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notifications).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.unreadCount).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
  });

  it("应支持分页参数", async () => {
    setSession("user1");
    mockNotificationFindMany.mockResolvedValue([]);
    mockNotificationCount.mockResolvedValueOnce(50).mockResolvedValueOnce(10);

    const { GET } = await import("../route");
    const url = "http://localhost:3000/api/notifications?page=2&pageSize=10";
    const res = await GET(makeRequest("GET", url), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("应仅返回当前用户的通知", async () => {
    setSession("user1");
    mockNotificationFindMany.mockResolvedValue([]);
    mockNotificationCount.mockResolvedValue(0);

    const { GET } = await import("../route");
    const res = await GET(makeRequest("GET"), { params: {} });

    expect(res.status).toBe(200);
    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user1" },
      }),
    );
  });
});

// ==================== PATCH /api/notifications/[id]/read Tests ====================

describe("PATCH /api/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../[id]/read/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/notifications/n1/read"),
      { params: { id: "n1" } },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 404 当通知不存在", async () => {
    setSession("user1");
    mockNotificationFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../[id]/read/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/notifications/n999/read"),
      { params: { id: "n999" } },
    );
    expect(res.status).toBe(404);
  });

  it("应返回 403 当非通知所有者尝试标记", async () => {
    setSession("user2");
    mockNotificationFindUnique.mockResolvedValue({
      id: "n1",
      userId: "user1",
      isRead: false,
    });

    const { PATCH } = await import("../[id]/read/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/notifications/n1/read"),
      { params: { id: "n1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应成功标记通知为已读", async () => {
    setSession("user1");
    mockNotificationFindUnique.mockResolvedValue({
      id: "n1",
      userId: "user1",
      isRead: false,
    });
    const updatedNotification = {
      id: "n1",
      userId: "user1",
      isRead: true,
      type: "COMMENT",
      title: "新评论",
      content: "内容",
    };
    mockNotificationUpdate.mockResolvedValue(updatedNotification);

    const { PATCH } = await import("../[id]/read/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/notifications/n1/read"),
      { params: { id: "n1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notification.isRead).toBe(true);
    expect(mockNotificationUpdate).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: { isRead: true },
    });
  });

  it("应对已读通知直接返回（不重复更新）", async () => {
    setSession("user1");
    const alreadyRead = {
      id: "n1",
      userId: "user1",
      isRead: true,
    };
    mockNotificationFindUnique.mockResolvedValue(alreadyRead);

    const { PATCH } = await import("../[id]/read/route");
    const res = await PATCH(
      makeRequest("PATCH", "http://localhost:3000/api/notifications/n1/read"),
      { params: { id: "n1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.notification).toEqual(alreadyRead);
    expect(mockNotificationUpdate).not.toHaveBeenCalled();
  });
});

// ==================== POST /api/notifications/read-all Tests ====================

describe("POST /api/notifications/read-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../read-all/route");
    const res = await POST(
      makeRequest("POST", "http://localhost:3000/api/notifications/read-all"),
      { params: {} },
    );
    expect(res.status).toBe(401);
  });

  it("应成功标记所有未读通知为已读", async () => {
    setSession("user1");
    mockNotificationUpdateMany.mockResolvedValue({ count: 5 });

    const { POST } = await import("../read-all/route");
    const res = await POST(
      makeRequest("POST", "http://localhost:3000/api/notifications/read-all"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.updatedCount).toBe(5);
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user1", isRead: false },
      data: { isRead: true },
    });
  });

  it("应在没有未读通知时返回 0", async () => {
    setSession("user1");
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 });

    const { POST } = await import("../read-all/route");
    const res = await POST(
      makeRequest("POST", "http://localhost:3000/api/notifications/read-all"),
      { params: {} },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.updatedCount).toBe(0);
  });
});
