import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  flushdb: vi.fn(),
  revalidatePath: vi.fn(),
  rm: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/redis", () => ({
  default: { flushdb: mocks.flushdb },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("node:fs/promises", () => ({
  rm: mocks.rm,
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: { SYSTEM_RESTART: "SYSTEM_RESTART" },
  AuditTargetType: { SYSTEM: "SYSTEM" },
  logAudit: mocks.logAudit,
}));

import { getServerSession } from "next-auth/next";

const mockGetServerSession = vi.mocked(getServerSession);

function makeRequest(confirmation?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/system/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}

function setSession(role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id: "operator-1", role },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
}

describe("POST /api/admin/system/restart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flushdb.mockResolvedValue("OK");
    mocks.rm.mockResolvedValue(undefined);
    mocks.logAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("未登录时返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    const response = await POST(makeRequest("RESTART"), { params: {} });

    expect(response.status).toBe(401);
    expect(mocks.flushdb).not.toHaveBeenCalled();
  });

  it("普通管理员无权执行系统重启", async () => {
    setSession("ADMIN");
    const { POST } = await import("../route");
    const response = await POST(makeRequest("RESTART"), { params: {} });

    expect(response.status).toBe(403);
    expect(mocks.flushdb).not.toHaveBeenCalled();
  });

  it("缺少明确确认时不执行操作", async () => {
    setSession("SUPER_ADMIN");
    const { POST } = await import("../route");
    const response = await POST(makeRequest(), { params: {} });

    expect(response.status).toBe(400);
    expect(mocks.flushdb).not.toHaveBeenCalled();
  });

  it("超级管理员可清理缓存并请求重启", async () => {
    setSession("SUPER_ADMIN");
    const { POST } = await import("../route");
    const response = await POST(makeRequest("RESTART"), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(response.headers.get("Clear-Site-Data")).toBe('"cache"');
    expect(mocks.flushdb).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.rm).toHaveBeenCalledOnce();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "operator-1",
      "SYSTEM_RESTART",
      "SYSTEM",
      "forum-dcr2026",
      expect.objectContaining({ cacheScopes: ["redis", "next", "browser"] }),
    );
  });

  it("缓存清理失败时返回 500 且不删除 Next.js 缓存", async () => {
    setSession("SUPER_ADMIN");
    mocks.flushdb.mockRejectedValue(new Error("Redis unavailable"));
    const { POST } = await import("../route");
    const response = await POST(makeRequest("RESTART"), { params: {} });

    expect(response.status).toBe(500);
    expect(mocks.rm).not.toHaveBeenCalled();
  });
});
