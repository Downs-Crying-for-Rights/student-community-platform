import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockCaseFindUnique = vi.fn();
const mockTimelineEventFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
    timelineEvent: { findMany: (...args: unknown[]) => mockTimelineEventFindMany(...args) },
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

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}/timeline`, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/cases/[id]/timeline", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../[id]/timeline/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(401);
  });

  it("应返回 404 当委托不存在", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue(null);

    const { GET } = await import("../[id]/timeline/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(404);
  });

  it("应返回 403 当用户无权访问", async () => {
    setSession("other-user", "USER");
    mockCaseFindUnique.mockResolvedValue({ submitterId: "user1", handlerId: null });

    const { GET } = await import("../[id]/timeline/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(403);
  });

  it("提交者可以查看时间线", async () => {
    setSession("user1", "USER");
    mockCaseFindUnique.mockResolvedValue({ submitterId: "user1", handlerId: null });
    mockTimelineEventFindMany.mockResolvedValue([
      { id: "te1", action: "委托创建", newStatus: "OPENED", createdAt: new Date() },
    ]);

    const { GET } = await import("../[id]/timeline/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0].action).toBe("委托创建");
  });

  it("Admin 可以查看任何委托时间线", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue({ submitterId: "user1", handlerId: "helper1" });
    mockTimelineEventFindMany.mockResolvedValue([]);

    const { GET } = await import("../[id]/timeline/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(200);
  });
});
