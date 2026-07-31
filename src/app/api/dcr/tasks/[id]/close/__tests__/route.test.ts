import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  taskFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  sessionFindUniqueOrThrow: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  logAudit: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(),
    helpSession: {
      update: mocks.sessionUpdate,
      updateMany: mocks.sessionUpdateMany,
      findUniqueOrThrow: mocks.sessionFindUniqueOrThrow,
      findUnique: mocks.sessionFindUnique,
      findMany: mocks.sessionFindMany,
    },
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

const session1 = "cm1234567890123456789012";
const session2 = "cm2234567890123456789012";

function request(userId: string, body: Record<string, unknown>) {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: userId, role: "USER" },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  } as never);
  return new NextRequest("http://localhost/api/dcr/tasks/task1/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function task() {
  return {
    id: "task1",
    title: "多互助人任务",
    status: "EVIDENCE_PENDING",
    requesterId: "requester",
    requesterConfirmed: false,
    helperConfirmed: false,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    helpSessions: [
      {
        id: session1,
        helperId: "helper1",
        requesterId: "requester",
        status: "EVIDENCE_PENDING",
        requesterConfirmed: true,
        helperConfirmed: false,
        closedAt: null,
        evidenceRoom: { items: [{ type: "NOTE" }, { type: "OUTCOME" }] },
      },
      {
        id: session2,
        helperId: "helper2",
        requesterId: "requester",
        status: "IN_PROGRESS",
        requesterConfirmed: false,
        helperConfirmed: false,
        closedAt: null,
        evidenceRoom: { items: [] },
      },
    ],
  };
}

describe("POST /api/dcr/tasks/[id]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskFindUnique.mockResolvedValue(task());
    mocks.sessionFindUniqueOrThrow.mockResolvedValue({
      ...task().helpSessions[0],
      helperConfirmed: true,
    });
    mocks.sessionFindUnique.mockResolvedValue(task().helpSessions[0]);
    mocks.sessionFindMany.mockResolvedValue([{ status: "COMPLETED" }, { status: "IN_PROGRESS" }]);
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.taskUpdate.mockResolvedValue({ count: 1 });
  });

  it("completes only the authenticated helper's session", async () => {
    const response = await POST(
      request("helper1", { action: "confirm", sessionId: session1 }),
      { params: { id: "task1" } },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ status: "IN_PROGRESS", sessionId: session1, sessionStatus: "COMPLETED" });
    expect(mocks.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "IN_PROGRESS" }),
    }));
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({
      title: "互助会话已结案",
    }));
  });

  it("does not write a score when completing a session", async () => {
    const response = await POST(
      request("helper1", { action: "confirm", sessionId: session1 }),
      { params: { id: "task1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED" }),
    }));
  });

  it("stores a completion report when the final session completes", async () => {
    mocks.sessionFindMany.mockResolvedValue([{ status: "COMPLETED" }]);
    const response = await POST(
      request("helper1", { action: "confirm", sessionId: session1 }),
      { params: { id: "task1" } },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("COMPLETED");
    expect(data.completionReport).toMatchObject({ taskId: "task1", closeType: "mutual" });
    expect(mocks.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED", completionReport: expect.any(Object) }),
    }));
  });

  it("notifies the counterpart when a close request is awaiting confirmation", async () => {
    mocks.sessionFindUniqueOrThrow.mockResolvedValue({
      ...task().helpSessions[1],
      helperConfirmed: true,
    });
    mocks.sessionFindUnique.mockResolvedValue(task().helpSessions[1]);
    mocks.sessionFindMany.mockResolvedValue([{ status: "EVIDENCE_PENDING" }]);

    const response = await POST(
      request("helper2", { action: "request", sessionId: session2 }),
      { params: { id: "task1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.notifyUsers).toHaveBeenCalledWith(["requester"], expect.objectContaining({
      title: "收到互助结案请求",
    }));
  });

  it("requires the requester to identify one session when several are active", async () => {
    const response = await POST(
      request("requester", { action: "request" }),
      { params: { id: "task1" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("does not let one helper close another helper's session", async () => {
    const response = await POST(
      request("helper1", { action: "confirm", sessionId: session2 }),
      { params: { id: "task1" } },
    );

    expect(response.status).toBe(404);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("does not accept a confirm action before a close request", async () => {
    const nextTask = task();
    nextTask.helpSessions[1].status = "IN_PROGRESS";
    mocks.taskFindUnique.mockResolvedValue(nextTask);
    const response = await POST(request("helper2", { action: "confirm", sessionId: session2 }), { params: { id: "task1" } });
    expect(response.status).toBe(400);
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });
});
