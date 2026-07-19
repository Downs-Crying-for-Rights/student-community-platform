import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  threadUpsert: vi.fn(),
  threadFindMany: vi.fn(),
  logAudit: vi.fn(),
  requireConsent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: mocks.userFindUnique },
  dMThread: { upsert: mocks.threadUpsert, findMany: mocks.threadFindMany },
} }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/dm-consent", () => ({ requireDMConsent: mocks.requireConsent }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET, POST } from "../route";

const currentUser = "cm0000000000000000000001";
const otherUser = "cm0000000000000000000002";

describe("/api/dm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: currentUser, role: "USER" } } as never);
    mocks.userFindUnique.mockResolvedValue({ id: otherUser });
    mocks.threadUpsert.mockResolvedValue({ id: "thread-1", participant1Id: currentUser, participant2Id: otherUser });
    mocks.logAudit.mockResolvedValue({});
    mocks.requireConsent.mockResolvedValue(null);
  });

  it("rejects DM access until the current consent text is accepted", async () => {
    mocks.requireConsent.mockResolvedValue({ title: "私信巡查授权提示", content: "授权文本", version: 2 });

    const response = await GET(new NextRequest("http://localhost/api/dm"), {} as never);
    const data = await response.json();

    expect(response.status).toBe(428);
    expect(data.code).toBe("DM_CONSENT_REQUIRED");
    expect(data.consent.version).toBe(2);
    expect(mocks.threadFindMany).not.toHaveBeenCalled();
  });

  it("creates or reuses an order-independent one-to-one thread", async () => {
    const response = await POST(new NextRequest("http://localhost/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: otherUser }),
    }), {} as never);

    expect(response.status).toBe(200);
    expect(mocks.threadUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        participant1Id_participant2Id: {
          participant1Id: currentUser,
          participant2Id: otherUser,
        },
      },
    }));
  });

  it("supports historical users with a non-cuid identifier", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "superadmin-production" });
    mocks.threadUpsert.mockResolvedValue({ id: "thread-2" });

    const response = await POST(new NextRequest("http://localhost/api/dm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: "superadmin-production" }),
    }), {} as never);

    expect(response.status).toBe(200);
  });

  it("never includes an administrator as a conversation participant", async () => {
    mocks.threadFindMany.mockResolvedValue([{
      id: "thread-1",
      participant1Id: currentUser,
      participant2Id: otherUser,
      participant1: { id: currentUser, nickname: "我", avatar: null },
      participant2: { id: otherUser, nickname: "对方", avatar: null },
      messages: [],
      updatedAt: new Date(),
    }]);

    const response = await GET(new NextRequest("http://localhost/api/dm"), {} as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads[0].other.id).toBe(otherUser);
    expect(Object.keys(data.threads[0])).not.toContain("admin");
  });
});
