import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  taskFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  taskUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  notifyUsers: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(),
    helpSession: { findUnique: mocks.sessionFindUnique, findMany: mocks.sessionFindMany, updateMany: mocks.sessionUpdateMany },
    mutualAidTask: { findUnique: mocks.taskFindUnique, updateMany: mocks.taskUpdate },
    taskTimelineEvent: { create: mocks.timelineCreate },
  };
  return {
    default: {
      mutualAidTask: { findUnique: mocks.taskFindUnique },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/mutual-aid-notifications", () => ({
  notifyMutualAidUsersBestEffort: mocks.notifyUsers,
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

function request(userId: string) {
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: userId, role: "USER" } } as never);
  return new NextRequest("http://localhost/api/dcr/tasks/task1/start", { method: "POST" });
}

describe("POST /api/dcr/tasks/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskFindUnique.mockResolvedValue({
      id: "task1",
      title: "搬运物资",
      status: "CLAIMED",
      requesterId: "requester",
      helpSessions: [
        { id: "session1", helperId: "helper1", status: "CLAIMED" },
        { id: "session2", helperId: "helper2", status: "CLAIMED" },
      ],
    });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionFindUnique.mockResolvedValue({ helperId: "helper2", status: "CLAIMED" });
    mocks.sessionFindMany.mockResolvedValue([{ status: "IN_PROGRESS" }, { status: "CLAIMED" }]);
    mocks.taskUpdate.mockResolvedValue({ count: 1 });
  });

  it("starts only the authenticated helper's session", async () => {
    const response = await POST(request("helper2"), { params: { id: "task1" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ status: "IN_PROGRESS", sessionId: "session2", sessionStatus: "IN_PROGRESS" });
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: "session2", status: "CLAIMED" },
      data: { status: "IN_PROGRESS" },
    });
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({
      title: "互助会话已开始",
    }));
  });

  it("rejects a user who has no active session", async () => {
    const response = await POST(request("outsider"), { params: { id: "task1" } });

    expect(response.status).toBe(403);
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });
});
