import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  rateLimit: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: { supportTicket: { findMany: mocks.findMany, create: mocks.create } } }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scan }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET, POST } from "../route";

describe("/api/support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "USER", phone: "13800000000" } } as never);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scan.mockResolvedValue([]);
  });

  it("lists only the authenticated owner's tickets with no-store", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/support"), { params: {} });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { requesterId: "user-1" },
    }));
  });

  it("creates a general ticket and initial user message", async () => {
    mocks.create.mockResolvedValue({ id: "ticket-1" });
    const response = await POST(new NextRequest("http://localhost/api/support", {
      method: "POST",
      body: JSON.stringify({ subject: "Account access", content: "My phone is 13800000000", informationAttested: true }),
      headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      kind: "GENERAL",
      requesterId: "user-1",
      messages: { create: expect.objectContaining({ authorType: "USER", authorId: "user-1" }) },
    }) }));
  });

  it("requires the information attestation before creating a ticket", async () => {
    const response = await POST(new NextRequest("http://localhost/api/support", {
      method: "POST",
      body: JSON.stringify({ subject: "Account access", content: "Please help" }),
      headers: { "Content-Type": "application/json" },
    }), { params: {} });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请先勾选并确认工单信息声明" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("blocks configured words without echoing submitted content", async () => {
    mocks.scan.mockResolvedValue([{ word: "forbidden-value", category: "OTHER", startIndex: 0, endIndex: 15 }]);
    const response = await POST(new NextRequest("http://localhost/api/support", {
      method: "POST",
      body: JSON.stringify({ subject: "forbidden-value", content: "private body", informationAttested: true }),
      headers: { "Content-Type": "application/json" },
    }), { params: {} });
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain("forbidden-value");
    expect(text).not.toContain("private body");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
