import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), punishment: vi.fn(), existing: vi.fn(), create: vi.fn(), audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  userPunishment: { findFirst: mocks.punishment },
  supportTicket: { findFirst: mocks.existing, create: mocks.create },
} }));
vi.mock("@/lib/punishment-challenge", () => ({ verifyPunishmentChallenge: mocks.verify }));
vi.mock("@/lib/punishment-service", () => ({ canAppealPunishment: () => true }));
vi.mock("@/lib/support-ticket-server", () => ({ containsBlockedSupportWord: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
  rateLimitKeyForIP: (value: string) => value,
  requestIP: (request: Request) => request.headers.get("x-real-ip") || "unknown",
}));
vi.mock("@/lib/telemetry", () => ({ withTelemetry: (handler: unknown) => handler }));

import { GET, POST } from "./route";

describe("ban appeal challenge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue("user-1");
    mocks.punishment.mockResolvedValue({ id: "punishment-1", type: "TEMPORARY_BAN", reason: "违规原因", startsAt: new Date("2026-01-01"), expiresAt: new Date("2026-12-01"), action: "APPLIED", revokedAt: null });
    mocks.existing.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "ticket-1" });
  });

  it("rejects a missing or expired challenge", async () => {
    mocks.verify.mockReturnValue(null);
    const response = await GET(new NextRequest("http://localhost/api/punishments/ban-appeal"), { params: {} });
    expect(response.status).toBe(401);
    expect(mocks.punishment).not.toHaveBeenCalled();
  });

  it("returns only the active ban and existing appeal summary", async () => {
    mocks.existing.mockResolvedValue({ id: "ticket-1", status: "OPEN" });
    const response = await GET(new NextRequest("http://localhost/api/punishments/ban-appeal"), { params: {} });
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.punishment).toEqual(expect.objectContaining({ typeLabel: "临时封禁", reason: "违规原因" }));
    expect(data.existingAppeal).toEqual({ id: "ticket-1", status: "OPEN" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates an appeal for the challenged user", async () => {
    const response = await POST(new NextRequest("http://localhost/api/punishments/ban-appeal", {
      method: "POST", body: JSON.stringify({ content: "请求复核处罚" }), headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requesterId: "user-1", punishmentId: "punishment-1" }) }));
  });
});
