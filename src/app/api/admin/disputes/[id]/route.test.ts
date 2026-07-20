import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(), sessionUpdate: vi.fn(), sessionUpdateMany: vi.fn(),
  sessionFindMany: vi.fn(),
  claimUpdateMany: vi.fn(), taskUpdate: vi.fn(), timelineCreate: vi.fn(),
  moderationCreate: vi.fn(), auditCreate: vi.fn(), notify: vi.fn(),
  userUpdate: vi.fn(), punishmentCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(),
    helpSession: { findUnique: mocks.sessionFindUnique, findMany: mocks.sessionFindMany, update: mocks.sessionUpdate, updateMany: mocks.sessionUpdateMany },
    helpClaim: { updateMany: mocks.claimUpdateMany },
    mutualAidTask: { update: mocks.taskUpdate },
    taskTimelineEvent: { create: mocks.timelineCreate },
    moderationAction: { create: mocks.moderationCreate },
    auditLog: { create: mocks.auditCreate },
    user: { update: mocks.userUpdate },
    userPunishment: { create: mocks.punishmentCreate },
  };
  return { default: {
    helpSession: { findUnique: mocks.sessionFindUnique },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  } };
});
vi.mock("@/lib/mutual-aid-notifications", () => ({ notifyMutualAidUsersBestEffort: mocks.notify }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "./route";

const sessionId = "cm1234567890123456789012";
const otherSessionId = "cm2234567890123456789012";

function request(body: Record<string, unknown>) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as never);
  return new NextRequest(`http://localhost/api/admin/disputes/${sessionId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function disputedSession() {
  return {
    id: sessionId, status: "DISPUTED", statusBeforeDispute: "IN_PROGRESS",
    requesterId: "requester", helperId: "helper", claim: { id: "claim1" },
    task: {
      id: "task1", title: "争议恢复任务", status: "DISPUTED",
      helpSessions: [
        { id: sessionId, status: "DISPUTED" },
        { id: otherSessionId, status: "DISPUTED" },
      ],
    },
  };
}

describe("POST /api/admin/disputes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindUnique.mockResolvedValue(disputedSession());
    mocks.sessionFindMany.mockResolvedValue([{ status: "IN_PROGRESS" }, { status: "DISPUTED" }]);
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.taskUpdate.mockResolvedValue({});
  });

  it("restores only the selected session and keeps another dispute active", async () => {
    const response = await POST(request({ action: "dismiss", reason: "证据不足，恢复处理" }), { params: { id: sessionId } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ sessionId, sessionStatus: "IN_PROGRESS", taskStatus: "DISPUTED" });
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: sessionId, status: "DISPUTED" },
      data: { status: "IN_PROGRESS", statusBeforeDispute: null },
    });
    expect(mocks.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "DISPUTED" } }));
    expect(mocks.auditCreate).toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(["requester", "helper"], expect.objectContaining({
      title: "互助争议已驳回，可继续处理",
    }));
  });

  it("closes only the selected session when replacing its helper", async () => {
    const response = await POST(request({ action: "replace_helper", reason: "更换该帮助者" }), { params: { id: sessionId } });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: sessionId, status: "DISPUTED" } }));
    expect(mocks.claimUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId } }));
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("rejects a stale second resolution", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ ...disputedSession(), status: "IN_PROGRESS" });
    const response = await POST(request({ action: "dismiss", reason: "重复处理" }), { params: { id: sessionId } });
    expect(response.status).toBe(409);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });
});
