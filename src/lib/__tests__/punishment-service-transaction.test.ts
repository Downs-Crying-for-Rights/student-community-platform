import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  punishmentCreate: vi.fn(),
  punishmentFindUnique: vi.fn(),
  punishmentFindUniqueOrThrow: vi.fn(),
  punishmentFindMany: vi.fn(),
  punishmentUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  notificationCreate: vi.fn(),
}));

const tx = {
  $executeRaw: mocks.executeRaw,
  user: { findUnique: mocks.userFindUnique, count: mocks.userCount, update: mocks.userUpdate, updateMany: mocks.userUpdateMany },
  userPunishment: {
    create: mocks.punishmentCreate,
    findUnique: mocks.punishmentFindUnique,
    findUniqueOrThrow: mocks.punishmentFindUniqueOrThrow,
    findMany: mocks.punishmentFindMany,
    updateMany: mocks.punishmentUpdateMany,
  },
  notification: { create: mocks.notificationCreate },
};

vi.mock("@/lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));

import prisma from "@/lib/prisma";
import { applyPunishment, revokePunishment } from "@/lib/punishment-service";

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
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.userCount).toHaveBeenCalledAfter(mocks.executeRaw);
    expect(mocks.punishmentCreate).toHaveBeenCalledAfter(mocks.userCount);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { violationCount: { increment: 1 } },
    });
  });

  it("locks before enforcing the global last-super-admin invariant", async () => {
    mocks.userCount.mockResolvedValue(1);

    await expect(applyPunishment({
      userId: "admin-1",
      operatorId: "admin-2",
      type: "PERMANENT_BAN",
      reason: "test",
    })).rejects.toThrow("LAST_ACTIVE_SUPER_ADMIN");

    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.punishmentCreate).not.toHaveBeenCalled();
  });

  it("decrements the violation count when a punishment is revoked", async () => {
    mocks.punishmentFindUnique.mockResolvedValue({ id: "punishment-1", userId: "user-1", action: "APPLIED", revokedAt: null });
    mocks.punishmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.punishmentFindUniqueOrThrow.mockResolvedValue({ id: "punishment-1", userId: "user-1" });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockReset();
    mocks.userFindUnique.mockResolvedValue({ deactivatedAt: null });

    await revokePunishment({ punishmentId: "punishment-1", operatorId: "admin-1", reason: "误判" });

    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", violationCount: { gt: 0 } },
      data: { violationCount: { decrement: 1 } },
    });
  });
});
