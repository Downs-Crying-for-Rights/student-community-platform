import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==================== Mocks ====================

const mockCaseFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { CASE_EXPORT: "CASE_EXPORT" },
  AuditTargetType: { CASE: "CASE" },
}));

const mockScanContent = vi.fn();
vi.mock("@/lib/sensitive-engine", () => ({
  scanContent: (...args: unknown[]) => mockScanContent(...args),
}));

vi.mock("@/lib/utils", () => ({
  hashIP: (val: string) => `hashed_${val}`,
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/cases/${id}/export`, { method: "GET" });
}

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

// ==================== Tests ====================

describe("GET /api/cases/[id]/export", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("应返回 401 当用户未登录", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../[id]/export/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(401);
  });

  it("应返回 403 当非 Admin 用户尝试导出", async () => {
    setSession("user1", "USER");
    const { GET } = await import("../[id]/export/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(403);
  });

  it("应返回 404 当委托不存在", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue(null);

    const { GET } = await import("../[id]/export/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);
    expect(res.status).toBe(404);
  });

  it("Admin 可以导出 CSV 并进行二次脱敏", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue({
      id: "case1",
      category: "TUTORING",
      status: "OPENED",
      formData: { subject: "数学", teacher: "张老师" },
      pledgeText: "我确认已移除所有可识别信息",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      submitterId: "user1",
    });

    // Simulate sensitive content detection in "张老师"
    mockScanContent.mockImplementation(async (text: string) => {
      if (text.includes("张老师")) {
        return [{ word: "张老师", category: "PII", startIndex: text.indexOf("张老师"), endIndex: text.indexOf("张老师") + 3 }];
      }
      return [];
    });

    const { GET } = await import("../[id]/export/route");
    const res = await GET(makeGetRequest("case1"), { params: Promise.resolve({ id: "case1" }) } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("case-case1.csv");

    const csv = await res.text();
    expect(csv).toContain("id,category,status,formData,pledgeText,createdAt,submitterId");
    // formData should have desensitized teacher name
    expect(csv).toContain("[已脱敏]");
    // submitterId should be hashed
    expect(csv).toContain("hashed_user1");
  });

  it("无敏感词时 formData 保持原样", async () => {
    setSession("admin1", "ADMIN");
    mockCaseFindUnique.mockResolvedValue({
      id: "case2",
      category: "FEES",
      status: "CLOSED",
      formData: { amount: "500" },
      pledgeText: "声明",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      submitterId: "user2",
    });

    mockScanContent.mockResolvedValue([]);

    const { GET } = await import("../[id]/export/route");
    const res = await GET(makeGetRequest("case2"), { params: Promise.resolve({ id: "case2" }) } as never);

    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("500");
  });
});
