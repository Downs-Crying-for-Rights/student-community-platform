import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  claimFindUnique: vi.fn(),
  claimUpdateMany: vi.fn(),
  sessionCreate: vi.fn(),
  messageCreate: vi.fn(),
  claimUpdate: vi.fn(),
  taskUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  userUpdateMany: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    helpClaim: { updateMany: mocks.claimUpdateMany, update: mocks.claimUpdate },
    helpSession: { create: mocks.sessionCreate },
    helpChatMessage: { create: mocks.messageCreate },
    mutualAidTask: { update: mocks.taskUpdate },
    taskTimelineEvent: { create: mocks.timelineCreate },
    user: { updateMany: mocks.userUpdateMany },
  };
  return { default: {
    helpClaim: { findUnique: mocks.claimFindUnique, updateMany: mocks.claimUpdateMany },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } };
});
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

function request(action: "accept" | "reject") {
  return new NextRequest("http://localhost/api/dcr/claims/claim-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

const context = { params: { claimId: "claim-1" } };
const claim = {
  id: "claim-1",
  status: "PENDING",
  requesterId: "requester",
  applicantId: "helper",
  targetTaskId: "task-1",
  offeredTaskId: "task-2",
  targetTask: { id: "task-1", status: "OPEN", requesterId: "requester" },
  offeredTask: { id: "task-2", title: "对方的委托" },
};

describe("POST /api/dcr/claims/[claimId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "requester", role: "USER" } } as never);
    mocks.claimFindUnique.mockResolvedValue(claim);
    mocks.claimUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionCreate.mockResolvedValue({
      id: "session-1",
      helpChat: { id: "chat-1" },
      evidenceRoom: { id: "room-1" },
    });
    mocks.logAudit.mockResolvedValue({});
  });

  it("creates the mutual-aid session only after the requester accepts", async () => {
    const response = await POST(request("accept"), context as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-1");
    expect(mocks.claimUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "claim-1", status: "PENDING" },
      data: { status: "ACCEPTED", requesterConfirmed: true },
    }));
    expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isSystemMessage: true, senderId: "helper" }),
    }));
  });

  it("prevents concurrent decisions from creating duplicate sessions", async () => {
    mocks.claimUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request("accept"), context as never);

    expect(response.status).toBe(409);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects without creating a session", async () => {
    const response = await POST(request("reject"), context as never);

    expect(response.status).toBe(200);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });
});
