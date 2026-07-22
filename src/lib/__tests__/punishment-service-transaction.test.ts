import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  punishmentCreate: vi.fn(),
  punishmentFindMany: vi.fn(),
  userUpdate: vi.fn(),
  notificationCreate: vi.fn(),
}));

const tx = {
  $queryRaw: mocks.queryRaw,
  user: { findUnique: mocks.userFindUnique, count: mocks.userCount, update: mocks.userUpdate },
  userPunishment: { create: mocks.punishmentCreate, findMany: mocks.punishmentFindMany },
  notification: { create: mocks.notificationCreate },
};

vi.mock("@/lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));

import prisma from "@/lib/prisma";
import { applyPunishment } from "@/lib/punishment-service";

describe("punishment mutation transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
    mocks.userFindUnique
      .mockResolvedValueOnce({ role: "SUPER_ADMIN", isBanned: false, deactivatedAt: null })
      .mockResolvedValueOnce({ deactivatedAt: null });
    mocks.userCount.mockResolvedValue(2);
    mocks.punishmentCreate.mockResolvedValue({ id: "punishment-1" });
    mocks.punishmentFindMany.mockResolvedValue([]);
    mocks.userUpdate.mockResolvedValue({ id: "admin-1", isMuted: false, muteUntil: null, isBanned: true, banUntil: null, isShadowBanned: false });
    mocks.notificationCreate.mockResolvedValue({});
  });

  it("wraps the whole mutation when the global prisma client is passed explicitly", async () => {
    await applyPunishment({
      userId: "admin-1",
      operatorId: "admin-2",
      type: "PERMANENT_BAN",
      reason: "test",
    }, prisma);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.userCount).toHaveBeenCalledAfter(mocks.queryRaw);
    expect(mocks.punishmentCreate).toHaveBeenCalledAfter(mocks.userCount);
  });

  it("locks before enforcing the global last-super-admin invariant", async () => {
    mocks.userCount.mockResolvedValue(1);

    await expect(applyPunishment({
      userId: "admin-1",
      operatorId: "admin-2",
      type: "PERMANENT_BAN",
      reason: "test",
    })).rejects.toThrow("LAST_ACTIVE_SUPER_ADMIN");

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.punishmentCreate).not.toHaveBeenCalled();
  });
});
