import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  identityFindUnique: vi.fn(),
  grantCreate: vi.fn(),
  grantDelete: vi.fn(),
  outboxCreateMany: vi.fn(),
}));

vi.mock("@/lib/qq-config", () => ({
  getQQConfig: () => ({ grantHmacKey: Buffer.alloc(32, 7), grantTtlSeconds: 900 }),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    qQGrant: { create: mocks.grantCreate, delete: mocks.grantDelete },
    qQMessageOutbox: { createMany: mocks.outboxCreateMany },
  };
  return {
    default: {
      user: { findMany: mocks.userFindMany },
      qQIdentity: { findUnique: mocks.identityFindUnique },
      qQMessageOutbox: { createMany: mocks.outboxCreateMany },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    },
  };
});

import {
  enqueueQQCaseReviewNotifications,
  enqueueQQCaseReviewResult,
} from "@/lib/qq-notifications";

describe("QQ case notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grantCreate.mockResolvedValue({ id: "grant-1" });
    mocks.grantDelete.mockResolvedValue({});
    mocks.outboxCreateMany.mockResolvedValue({ count: 1 });
  });

  it("queues one private review grant per bound moderator with no case content", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: "admin-1", qqIdentity: { id: "identity-1" } }]);

    await enqueueQQCaseReviewNotifications("case-1", "TUTORING");

    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } }),
    }));
    expect(mocks.grantCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: "CASE_REVIEW", userId: "admin-1", targetId: "case-1" }),
    }));
    const message = mocks.outboxCreateMany.mock.calls[0][0].data[0];
    expect(message.dedupeKey).toBe("case-review:case-1:admin-1");
    expect(message.content).toContain("分类：TUTORING；编号：case-1");
    expect(message.content).toMatch(/\/qq\/review\?token=qqg_/);
  });

  it("queues an approved publish grant and excludes review notes", async () => {
    mocks.identityFindUnique.mockResolvedValue({ id: "identity-1" });

    await enqueueQQCaseReviewResult("user-1", "case-1", "TUTORING", "APPROVED");

    expect(mocks.grantCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: "TASK_PUBLISH", userId: "user-1", targetId: "case-1" }),
    }));
    const content = mocks.outboxCreateMany.mock.calls[0][0].data[0].content;
    expect(content).toMatch(/\/qq\/publish\?token=qqg_/);
    expect(content).not.toContain("reviewNote");
  });

  it("queues only a safe status and internal ticket link for rejection", async () => {
    mocks.identityFindUnique.mockResolvedValue({ id: "identity-1" });

    await enqueueQQCaseReviewResult("user-1", "case-1", "TUTORING", "REJECTED");

    expect(mocks.grantCreate).not.toHaveBeenCalled();
    const content = mocks.outboxCreateMany.mock.calls[0][0].data[0].content;
    expect(content).toContain("审核未通过");
    expect(content).toContain("/dcr/tickets/case-1");
    expect(content).not.toContain("TUTORING");
  });
});
