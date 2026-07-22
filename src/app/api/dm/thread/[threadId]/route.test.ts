import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  threadFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  threadUpdate: vi.fn(),
  transaction: vi.fn(),
  scanContent: vi.fn(),
  requireConsent: vi.fn(),
  logAudit: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: {
  dMThread: { findUnique: mocks.threadFindUnique, update: mocks.threadUpdate },
  dMMessage: { create: mocks.messageCreate, findMany: vi.fn() },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: mocks.scanContent }));
vi.mock("@/lib/dm-consent", () => ({ requireDMConsent: mocks.requireConsent }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/notification", () => ({ createNotification: mocks.createNotification }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "./route";

describe("POST /api/dm/thread/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "sender", role: "USER", phone: "13800000000" } } as never);
    mocks.requireConsent.mockResolvedValue(null);
    mocks.threadFindUnique.mockResolvedValue({
      participant1Id: "recipient",
      participant2Id: "sender",
      isSystemReadOnly: false,
    });
    mocks.scanContent.mockResolvedValue([]);
    mocks.messageCreate.mockReturnValue({ operation: "create-message" });
    mocks.threadUpdate.mockReturnValue({ operation: "update-thread" });
    mocks.transaction.mockResolvedValue([{ id: "message-1", senderId: "sender", content: "你好" }, {}]);
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.createNotification.mockResolvedValue({});
  });

  function request() {
    return new NextRequest("http://localhost/api/dm/thread/thread-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "你好" }),
    });
  }

  it("notifies the other participant after a message is stored", async () => {
    const response = await POST(request(), { params: { threadId: "thread-1" } });

    expect(response.status).toBe(201);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "recipient",
      "SYSTEM",
      "收到新私信",
      "你收到了一条新的私信消息。",
      "/messages/dm/thread-1",
    );
  });

  it("still returns the stored message when notification delivery fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createNotification.mockRejectedValue(new Error("notification unavailable"));

    const response = await POST(request(), { params: { threadId: "thread-1" } });

    expect(response.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to create DM recipient notification",
      expect.any(Error),
    );
  });
});
