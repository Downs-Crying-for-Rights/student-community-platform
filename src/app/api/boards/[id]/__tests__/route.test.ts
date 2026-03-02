import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockBoardFindUnique = vi.fn();
const mockBoardUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    board: {
      findUnique: (...args: unknown[]) => mockBoardFindUnique(...args),
      update: (...args: unknown[]) => mockBoardUpdate(...args),
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

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = "http://localhost:3000/api/boards/board-1";
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init);
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("PATCH /api/boards/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params: { id: "board-1" } },
    );
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户尝试编辑板块", async () => {
    setSession("user1", "MODERATOR");
    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params: { id: "board-1" } },
    );
    expect(res.status).toBe(403);
  });

  it("应返回 404 当板块不存在", async () => {
    setSession("admin1", "ADMIN");
    mockBoardFindUnique.mockResolvedValue(null);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { name: "Updated" }),
      { params: { id: "nonexistent" } },
    );
    expect(res.status).toBe(404);
  });

  it("应允许 Admin 更新板块名称", async () => {
    setSession("admin1", "ADMIN");

    const existing = {
      id: "board-1",
      name: "旧名称",
      description: null,
      zone: "PUBLIC",
      sortWeight: 0,
      isActive: true,
    };
    mockBoardFindUnique.mockResolvedValue(existing);

    const updated = { ...existing, name: "新名称" };
    mockBoardUpdate.mockResolvedValue(updated);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { name: "新名称" }),
      { params: { id: "board-1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.board.name).toBe("新名称");
  });

  it("应允许 Admin 停用板块", async () => {
    setSession("admin1", "ADMIN");

    const existing = {
      id: "board-1",
      name: "板块",
      zone: "PUBLIC",
      sortWeight: 0,
      isActive: true,
    };
    mockBoardFindUnique.mockResolvedValue(existing);

    const updated = { ...existing, isActive: false };
    mockBoardUpdate.mockResolvedValue(updated);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { isActive: false }),
      { params: { id: "board-1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.board.isActive).toBe(false);
  });

  it("应允许 Admin 更新排序权重", async () => {
    setSession("admin1", "ADMIN");

    const existing = {
      id: "board-1",
      name: "板块",
      zone: "PUBLIC",
      sortWeight: 0,
      isActive: true,
    };
    mockBoardFindUnique.mockResolvedValue(existing);

    const updated = { ...existing, sortWeight: 10 };
    mockBoardUpdate.mockResolvedValue(updated);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { sortWeight: 10 }),
      { params: { id: "board-1" } },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.board.sortWeight).toBe(10);
  });

  it("应返回 400 当参数无效", async () => {
    setSession("admin1", "ADMIN");

    const existing = { id: "board-1", name: "板块", zone: "PUBLIC" };
    mockBoardFindUnique.mockResolvedValue(existing);

    const { PATCH } = await import("../../[id]/route");
    const res = await PATCH(
      makeRequest("PATCH", { sortWeight: -1 }),
      { params: { id: "board-1" } },
    );

    expect(res.status).toBe(400);
  });
});
