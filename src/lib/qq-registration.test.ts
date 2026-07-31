import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn().mockResolvedValue("bcrypt-hash"),
  transaction: vi.fn(),
  tx: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    pendingQQRegistration: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), update: vi.fn() },
    qQGrant: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    qQIdentity: { findUnique: vi.fn(), create: vi.fn() },
    qQOfficialIdentity: { findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/prisma", () => ({ default: { qQGrant: { findUnique: vi.fn() } } }));
vi.mock("@/lib/serializable-transaction", () => ({ runSerializableTransaction: mocks.transaction }));
vi.mock("@/lib/qq-config", () => ({ getQQConfig: () => ({
  identityEncryptionKey: Buffer.alloc(32, 1), identityHmacKey: Buffer.alloc(32, 2),
  grantHmacKey: Buffer.alloc(32, 3), keyVersion: 1, grantTtlSeconds: 900,
}) }));

import { createPendingQQRegistration, finalizeQQRegistration } from "./qq-registration";

describe("QQ bot registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operation) => operation(mocks.tx));
    mocks.tx.user.findUnique.mockResolvedValue(null);
    mocks.tx.pendingQQRegistration.findUnique.mockResolvedValue(null);
    mocks.tx.pendingQQRegistration.create.mockResolvedValue({ id: "pending-1" });
    mocks.tx.qQIdentity.findUnique.mockResolvedValue(null);
    mocks.tx.qQOfficialIdentity.findUnique.mockResolvedValue(null);
  });

  it("stores only a password hash and a purpose-bound credential hash", async () => {
    const result = await createPendingQQRegistration("new_user", "password-123", { "user-agreement": 1 });
    expect(result.ok).toBe(true);
    expect(mocks.hash).toHaveBeenCalledWith("password-123", 10);
    expect(mocks.tx.pendingQQRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ username: "new_user", passwordHash: "bcrypt-hash", agreementRevisions: { "user-agreement": 1 } }),
    });
    const grant = mocks.tx.qQGrant.create.mock.calls[0][0].data;
    expect(grant).toMatchObject({ purpose: "REGISTRATION_FINALIZE", pendingRegistrationId: "pending-1" });
    expect(grant.tokenHash).not.toContain("qqg_");
    expect(JSON.stringify(grant)).not.toContain("password-123");
  });

  it("atomically creates the user and encrypted QQ identity", async () => {
    mocks.tx.qQGrant.findFirst.mockResolvedValue({
      id: "grant-1",
      pendingRegistration: {
        id: "pending-1", username: "new_user", passwordHash: "bcrypt-hash",
        consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      },
    });
    mocks.tx.qQGrant.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.create.mockResolvedValue({ id: "user-1" });

    const reply = await finalizeQQRegistration(mocks.tx as never, `qqg_${"A".repeat(43)}`, "12345678");
    expect(reply).toContain("注册成功");
    expect(mocks.tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      username: "new_user", passwordHash: "bcrypt-hash",
    }) });
    const identity = mocks.tx.qQIdentity.create.mock.calls[0][0].data;
    expect(identity.userId).toBe("user-1");
    expect(identity.lookupHash).not.toBe("12345678");
    expect(identity.ciphertext).not.toContain("12345678");
    expect(mocks.tx.pendingQQRegistration.update).toHaveBeenCalledWith({
      where: { id: "pending-1" },
      data: expect.objectContaining({ passwordHash: null, userId: "user-1" }),
    });
  });

  it("creates nothing when the grant was already consumed", async () => {
    mocks.tx.qQGrant.findFirst.mockResolvedValue(null);
    await expect(finalizeQQRegistration(mocks.tx as never, `qqg_${"A".repeat(43)}`, "12345678"))
      .resolves.toContain("无效");
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.qQIdentity.create).not.toHaveBeenCalled();
  });

  it("registers an official openid without consuming the personal QQ identity slot", async () => {
    mocks.tx.qQGrant.findFirst.mockResolvedValue({
      id: "grant-official",
      pendingRegistration: {
        id: "pending-official", username: "official_user", passwordHash: "bcrypt-hash",
        consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      },
    });
    mocks.tx.qQGrant.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.create.mockResolvedValue({ id: "user-official" });
    const reply = await finalizeQQRegistration(
      mocks.tx as never,
      `qqg_${"B".repeat(43)}`,
      "openid_Abc-123",
      "QQ_OFFICIAL",
    );
    expect(reply).toContain("注册成功");
    expect(mocks.tx.qQOfficialIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-official", lookupHash: expect.any(String) }),
    });
    expect(mocks.tx.qQIdentity.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ details: expect.objectContaining({ method: "official_qq_bot" }) }),
    });
  });
});
