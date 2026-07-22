import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockTaskFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    mutualAidTask: { findUnique: (...args: unknown[]) => mockTaskFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
  },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../route";

function request() {
  return new NextRequest("http://localhost:3000/api/dcr/tasks/task1");
}

function session(id: string, role = "USER") {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id, role },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as never);
}

const task = {
  id: "task1",
  title: "验证任务",
  status: "IN_PROGRESS",
  requesterId: "requester",
  requester: { id: "requester", nickname: "请求者", avatar: null },
  timeline: [{ id: "event1", details: "敏感时间线" }],
  structuredFields: {
    source: "APPROVED_DELEGATION_CASE",
    approvedFormData: { schoolName: "私密学校", description: "私密描述" },
    province: "私密省份",
  },
  attachments: ["private-object-key"],
  caseId: "case-private",
  helpSession: {
    id: "session1",
    helperId: "helper",
    helpChat: { id: "chat1" },
    evidenceRoom: { id: "evidence1" },
  },
};

describe("GET /api/dcr/tasks/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 DCR 权限的非参与者不能查看任务", async () => {
    session("outsider");
    mockTaskFindUnique.mockResolvedValue(task);
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const res = await GET(request(), { params: { id: "task1" } });

    expect(res.status).toBe(403);
  });

  it("有 DCR 权限的非参与者可查看进行中任务的稳定脱敏结构", async () => {
    session("outsider");
    mockTaskFindUnique.mockResolvedValue(task);
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrPledgeSigned: true });

    const res = await GET(request(), { params: { id: "task1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.helpSession).toBeUndefined();
    expect(data.helpSessions).toEqual([]);
    expect(data.timeline).toBeUndefined();
    expect(data.title).toBe("校园事务互助委托");
    expect(data.summary).not.toBe(task.title);
    expect(data.structuredFields).toBeUndefined();
    expect(data.attachments).toBeUndefined();
    expect(data.caseId).toBeUndefined();
  });

  it("请求者可以查看完整任务", async () => {
    session("requester");
    mockTaskFindUnique.mockResolvedValue(task);

    const res = await GET(request(), { params: { id: "task1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.helpSession.helpChat.id).toBe("chat1");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("非参与 DCR 用户查看 OPEN 任务时只收到脱敏信息", async () => {
    session("outsider");
    mockTaskFindUnique.mockResolvedValue({ ...task, status: "OPEN" });
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true, dcrPledgeSigned: true });

    const res = await GET(request(), { params: { id: "task1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.helpSession).toBeUndefined();
    expect(data.helpSessions).toEqual([]);
    expect(data.timeline).toBeUndefined();
    expect(data.requester.id).toBeUndefined();
    expect(data.requesterId).toBeUndefined();
    expect(data.riskFlags).toBeUndefined();
    expect(data.completionReport).toBeUndefined();
    expect(data.title).toBe("校园事务互助委托");
    expect(data.summary).not.toContain("私密");
    expect(data.structuredFields).toBeUndefined();
    expect(data.attachments).toBeUndefined();
    expect(data.caseId).toBeUndefined();
  });
});
