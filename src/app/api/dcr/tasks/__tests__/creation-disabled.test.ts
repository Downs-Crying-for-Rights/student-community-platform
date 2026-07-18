import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const taskFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  default: { mutualAidTask: { findUnique: taskFindUnique } },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  AuditAction: { PUBLISH_TASK_FROM_APPROVED_CASE: "PUBLISH_TASK_FROM_APPROVED_CASE" },
  AuditTargetType: { TASK: "TASK" },
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../route";
import { PATCH } from "../[id]/route";

describe("case-only task publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "ADMIN" } } as never);
  });

  it("disables generic task creation", async () => {
    const response = await POST(new NextRequest("http://localhost/api/dcr/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "unlinked" }),
    }), {} as never);

    expect(response.status).toBe(410);
    expect((await response.json()).next).toBe("/dcr/delegate");
  });

  it("cannot publish a legacy unlinked task through review actions", async () => {
    taskFindUnique.mockResolvedValue({ id: "task-1", caseId: null });
    const response = await PATCH(new NextRequest("http://localhost/api/dcr/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }), { params: { id: "task-1" } });

    expect(response.status).toBe(410);
  });

  it("does not put case-linked tasks through a second review flow", async () => {
    taskFindUnique.mockResolvedValue({ id: "task-1", caseId: "case-1" });
    const response = await PATCH(new NextRequest("http://localhost/api/dcr/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "reject" }),
    }), { params: { id: "task-1" } });

    expect(response.status).toBe(409);
  });
});
