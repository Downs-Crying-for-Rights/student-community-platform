import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycleCount: vi.fn(),
  cycleFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  requestUpsert: vi.fn(),
  requestFindMany: vi.fn(),
  requestUpdateMany: vi.fn(),
  transaction: vi.fn(),
  cycleCreate: vi.fn(),
  linkCreate: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    mutualAidCycle: { count: mocks.cycleCount, findFirst: mocks.cycleFindFirst },
    mutualAidMatchRequest: {
      upsert: mocks.requestUpsert,
      findMany: mocks.requestFindMany,
      updateMany: mocks.requestUpdateMany,
    },
    user: { findUnique: mocks.userFindUnique, findMany: mocks.userFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/notification", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

import { enqueueThreePartyMatch } from "../mutual-aid-cycle";

describe("三方互助系统匹配", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cycleCount.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue({ id: "user-a", quizPassed: true, dcrAccess: true, role: "USER" });
    mocks.requestUpsert.mockResolvedValue({ id: "request-a", userId: "user-a", offerText: "A 的帮助" });
    mocks.requestFindMany.mockResolvedValue([]);
    mocks.cycleFindFirst.mockResolvedValue(null);
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.cycleCreate.mockResolvedValue({ id: "cycle-1" });
    mocks.linkCreate.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mutualAidCycle: { create: mocks.cycleCreate },
      mutualAidLink: { create: mocks.linkCreate },
      user: { update: mocks.userUpdate },
    }));
  });

  it("不接收手动 B/C，并用两个可用管理员补足三方", async () => {
    mocks.userFindMany
      .mockResolvedValueOnce([{ id: "admin-b" }, { id: "admin-c" }])
      .mockResolvedValueOnce([
        { id: "user-a", quizPassed: true, dcrAccess: true, role: "USER" },
        { id: "admin-b", quizPassed: false, dcrAccess: false, role: "ADMIN" },
        { id: "admin-c", quizPassed: false, dcrAccess: false, role: "SUPER_ADMIN" },
      ]);

    const result = await enqueueThreePartyMatch({ userId: "user-a", offerText: "A 的帮助" });

    expect(result.matched).toBe(true);
    expect(mocks.linkCreate).toHaveBeenCalledTimes(3);
    expect(mocks.linkCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ direction: "AB", fromUserId: "user-a", toUserId: "admin-b" }),
    }));
    expect(mocks.requestUpdateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: "MATCHED", matchedCycleId: "cycle-1" },
    }));
  });

  it("人数和管理员不足时保留等待状态，不创建半成品循环", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const result = await enqueueThreePartyMatch({ userId: "user-a" });

    expect(result.matched).toBe(false);
    expect(result.request.id).toBe("request-a");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
