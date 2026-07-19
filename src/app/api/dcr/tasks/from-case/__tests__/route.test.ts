import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockUserFindUnique = vi.fn();
const mockCaseFindUnique = vi.fn();
const mockCaseFindMany = vi.fn();
const mockTaskFindFirst = vi.fn();
const mockTaskCreate = vi.fn();
const mockLogAudit = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: (() => {
    const tx = {
      case: { findUnique: (...args: unknown[]) => mockCaseFindUnique(...args) },
      mutualAidTask: {
        findFirst: (...args: unknown[]) => mockTaskFindFirst(...args),
        create: (...args: unknown[]) => mockTaskCreate(...args),
      },
    };
    return {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    case: {
      findUnique: (...args: unknown[]) => mockCaseFindUnique(...args),
      findMany: (...args: unknown[]) => mockCaseFindMany(...args),
    },
    mutualAidTask: {
      findFirst: (...args: unknown[]) => mockTaskFindFirst(...args),
      create: (...args: unknown[]) => mockTaskCreate(...args),
    },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    };
  })(),
}));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/dcr/tasks/from-case", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const approvedCase = {
  id: "case-1",
  submitterId: "user-1",
  requestStatus: "APPROVED",
  category: "TUTORING",
  formData: {
    schoolName: "示例中学",
    contentType: "学校补课类",
    description: "这是管理员已经审核通过的委托内容。",
    demands: ["停止补课"],
  },
  pledgeText: "声明",
  grade: "高一",
  timeRange: null,
  province: null,
  city: null,
  expectedHelperProvince: null,
  riskPreference: null,
};

describe("POST /api/dcr/tasks/from-case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", role: "USER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);
    mockUserFindUnique.mockResolvedValue({ dcrAccess: true });
    mockCaseFindUnique.mockResolvedValue(approvedCase);
    mockTaskFindFirst.mockResolvedValue(null);
    mockTaskCreate.mockResolvedValue({ id: "task-1", status: "OPEN" });
    mockLogAudit.mockResolvedValue(undefined);
  });

  it("rejects users without DCR access", async () => {
    mockUserFindUnique.mockResolvedValue({ dcrAccess: false });

    const response = await POST(request({ caseId: "case-1" }), {} as never);

    expect(response.status).toBe(403);
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("does not allow another user's approved form", async () => {
    mockCaseFindUnique.mockResolvedValue({ ...approvedCase, submitterId: "other-user" });

    const response = await POST(request({ caseId: "case-1" }), {} as never);

    expect(response.status).toBe(403);
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("requires administrator approval", async () => {
    mockCaseFindUnique.mockResolvedValue({ ...approvedCase, requestStatus: "PENDING" });

    const response = await POST(request({ caseId: "case-1" }), {} as never);

    expect(response.status).toBe(409);
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("returns an existing active task instead of publishing a duplicate", async () => {
    mockTaskFindFirst.mockResolvedValue({ id: "task-existing", status: "IN_PROGRESS" });

    const response = await POST(request({ caseId: "case-1" }), {} as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.existing).toBe(true);
    expect(data.task.id).toBe("task-existing");
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it("publishes a safe allowlisted projection directly as OPEN", async () => {
    const response = await POST(request({ caseId: "case-1" }), {} as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.reusedApprovedCase).toBe(true);
    expect(mockTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        caseId: "case-1",
        requesterId: "user-1",
        status: "OPEN",
        title: "补课相关互助委托",
        summary: "一份已通过管理员审核的补课相关委托，具体信息仅向参与者开放。",
        expectedHelpType: "协助核实情况并提供合规互助",
        structuredFields: { source: "APPROVED_DELEGATION_CASE" },
        timeline: {
          create: expect.objectContaining({ newStatus: "OPEN", operatorId: "user-1" }),
        },
      }),
    }));
    expect(mockLogAudit).toHaveBeenCalledWith(
      "user-1",
      "PUBLISH_TASK_FROM_APPROVED_CASE",
      "TASK",
      "task-1",
      expect.objectContaining({ caseId: "case-1" }),
      undefined,
      expect.anything(),
    );
    const createData = mockTaskCreate.mock.calls[0][0].data;
    expect(JSON.stringify(createData)).not.toContain("approvedFormData");
    expect(JSON.stringify(createData)).not.toContain("示例中学");
    expect(JSON.stringify(createData)).not.toContain("管理员已经审核通过的委托内容");
  });
});
