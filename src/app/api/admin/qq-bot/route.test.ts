import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), heartbeat: vi.fn(),
  identityCount: vi.fn(), conversationCount: vi.fn(), draftCount: vi.fn(), grantCount: vi.fn(),
  inboxCount: vi.fn(), inboxFindMany: vi.fn(), outboxCount: vi.fn(), outboxGroupBy: vi.fn(), outboxFindMany: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/qq-bot-monitor", () => ({ getQQBotHeartbeat: mocks.heartbeat }));
vi.mock("@/lib/prisma", () => ({ default: {
  qQIdentity: { count: mocks.identityCount }, qQConversation: { count: mocks.conversationCount },
  qQDelegationDraft: { count: mocks.draftCount }, qQGrant: { count: mocks.grantCount },
  qQBotEventInbox: { count: mocks.inboxCount, findMany: mocks.inboxFindMany },
  qQMessageOutbox: { count: mocks.outboxCount, groupBy: mocks.outboxGroupBy, findMany: mocks.outboxFindMany },
} }));

function request(query = "") {
  return new NextRequest(`http://localhost:3000/api/admin/qq-bot${query}`);
}

describe("GET /api/admin/qq-bot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QQ_BOT_ENABLED = "true";
    process.env.QQ_BOT_EXPECTED_SELF_ID = "3917673573";
    mocks.identityCount.mockResolvedValue(2); mocks.conversationCount.mockResolvedValue(1);
    mocks.draftCount.mockResolvedValue(1); mocks.grantCount.mockResolvedValue(3);
    mocks.inboxCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mocks.outboxCount.mockResolvedValue(1);
    mocks.outboxGroupBy.mockResolvedValue([{ status: "FAILED", _count: { _all: 1 } }]);
    mocks.outboxCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-1", eventId: "very-long-sensitive-event-reference", selfId: "3917673573", createdAt: new Date("2026-07-19T10:00:00Z"), processedAt: new Date("2026-07-19T10:00:01Z") }]);
    mocks.outboxFindMany.mockResolvedValue([{ id: "outbox-1", status: "FAILED", attemptCount: 5, nextAttemptAt: new Date(), lastError: "ONEBOT_REJECTED", createdAt: new Date("2026-07-19T10:00:02Z"), updatedAt: new Date("2026-07-19T10:00:03Z"), deliveredAt: null }]);
    mocks.heartbeat.mockResolvedValue({ selfId: "3917673573", recordedAt: "2026-07-19T10:00:04.000Z", oneBotConnected: true, accountOnline: true, checkedAt: "2026-07-19T10:00:03.000Z" });
  });

  it("distinguishes a connected worker from an offline QQ account", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    mocks.heartbeat.mockResolvedValue({ selfId: "3917673573", recordedAt: "2026-07-19T10:00:04.000Z", oneBotConnected: true, accountOnline: false, checkedAt: "2026-07-19T10:00:03.000Z" });
    const { GET } = await import("./route");
    const body = await (await GET(request(), { params: {} })).json();
    expect(body.worker).toMatchObject({ status: "ACCOUNT_OFFLINE", heartbeatMatches: true, oneBotConnected: true, accountOnline: false });
  });

  it("rejects non-super administrators", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(request(), { params: {} })).status).toBe(403);
    expect(mocks.identityCount).not.toHaveBeenCalled();
  });

  it("returns operational data without message content or identity hashes", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(request("?hours=24&page=1&pageSize=50"), { params: {} });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.worker).toMatchObject({ status: "ONLINE", expectedSelfId: "3917673573", heartbeatMatches: true });
    expect(body.summary).toMatchObject({ identities: 2, activeConversations: 1 });
    expect(body.events).toHaveLength(2);
    expect(serialized).not.toMatch(/lookupHash|ciphertext|content|response|token=/i);
    expect(serialized).not.toContain("very-long-sensitive-event-reference");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid filters before querying the database", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root-1", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(request("?hours=0"), { params: {} })).status).toBe(400);
    expect(mocks.identityCount).not.toHaveBeenCalled();
  });
});
