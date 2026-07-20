import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  taskFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  taskUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  notificationCreateMany: vi.fn(),
  logAudit: vi.fn(),
  notifyUsers: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: vi.fn(),
    helpSession: { updateMany: mocks.sessionUpdateMany },
    mutualAidTask: { findUnique: mocks.taskFindUnique, updateMany: mocks.taskUpdate },
    taskTimelineEvent: { create: mocks.timelineCreate },
    notification: { createMany: mocks.notificationCreateMany },
  };
  return {
    default: {
      mutualAidTask: { findUnique: mocks.taskFindUnique },
      notification: { createMany: mocks.notificationCreateMany },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/mutual-aid-notifications", () => ({
  notifyMutualAidUsersBestEffort: mocks.notifyUsers,
  notifyMutualAidAdminsBestEffort: mocks.notifyAdmins,
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

const session1 = "cm1234567890123456789012";
const session2 = "cm2234567890123456789012";

function request(userId: string, sessionId?: string) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId, role: "USER" } } as never);
  return new NextRequest("http://localhost/api/dcr/tasks/task1/dispute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ explanation: "这是足够长度的争议情况说明", ...(sessionId ? { sessionId } : {}) }),
  });
}

function task() {
  return {
    id: "task1",
    title: "多互助人任务",
    status: "IN_PROGRESS",
    requesterId: "requester",
    helpSessions: [
      { id: session1, requesterId: "requester", helperId: "helper1", status: "IN_PROGRESS", closedAt: null },
      { id: session2, requesterId: "requester", helperId: "helper2", status: "CLAIMED", closedAt: null },
    ],
  };
}

describe("POST /api/dcr/tasks/[id]/dispute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskFindUnique.mockResolvedValue(task());
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.taskUpdate.mockResolvedValue({ count: 1 });
  });

  it("records the helper's own session and prior session state", async () => {
    const response = await POST(request("helper1", session1), { params: { id: "task1" } });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: session1 }),
      data: { status: "DISPUTED", statusBeforeDispute: "IN_PROGRESS" },
    }));
    expect(mocks.timelineCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: expect.stringContaining(`[session:${session1}]`) }),
    }));
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({
      title: "互助任务已发起争议",
    }));
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({
      title: "新的互助争议待处理",
    }));
    expect(mocks.notificationCreateMany).not.toHaveBeenCalled();
  });

  it("requires a requester to select a session when several are active", async () => {
    const response = await POST(request("requester"), { params: { id: "task1" } });

    expect(response.status).toBe(400);
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("does not let one helper dispute another helper's session", async () => {
    const response = await POST(request("helper1", session2), { params: { id: "task1" } });

    expect(response.status).toBe(404);
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });
});
