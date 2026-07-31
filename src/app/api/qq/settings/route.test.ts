import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  personalFind: vi.fn(),
  officialFind: vi.fn(),
  transaction: vi.fn(),
  personalDelete: vi.fn(),
  officialDelete: vi.fn(),
  userUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    qQIdentity: { findUnique: mocks.personalFind },
    qQOfficialIdentity: { findUnique: mocks.officialFind },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/qq-config", () => ({
  getQQConfig: () => ({ identityEncryptionKey: Buffer.alloc(32, 1) }),
}));
vi.mock("@/lib/qq-identity", () => ({
  decryptQQIdentity: () => "12345678",
  decryptQQOfficialIdentity: () => "openid_Abc-123",
}));
vi.mock("@/lib/rbac", () => ({
  withAuth: (handler: (request: Request & { user: { id: string } }) => unknown) =>
    (request: Request) => handler(Object.assign(request, { user: { id: "user-1" } })),
}));

import { DELETE, GET } from "./route";

describe("QQ identity settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operation) => operation({
      qQIdentity: { deleteMany: mocks.personalDelete },
      qQOfficialIdentity: { deleteMany: mocks.officialDelete },
      user: { update: mocks.userUpdate },
      auditLog: { create: mocks.auditCreate },
    }));
  });

  it("returns personal and official binding states independently", async () => {
    const createdAt = new Date("2026-08-01T00:00:00Z");
    mocks.personalFind.mockResolvedValue({ ciphertext: "a", iv: "b", authTag: "c", keyVersion: 1, createdAt });
    mocks.officialFind.mockResolvedValue({ ciphertext: "d", iv: "e", authTag: "f", keyVersion: 1, createdAt });
    const response = await GET(new NextRequest("https://forum.example/api/qq/settings"), {} as never);
    expect(await response.json()).toMatchObject({
      bound: true,
      personal: { bound: true, maskedQQ: "12****78" },
      official: { bound: true, maskedQQ: "op******23" },
    });
  });

  it("unbinds only the selected official identity", async () => {
    mocks.officialDelete.mockResolvedValue({ count: 1 });
    const response = await DELETE(new NextRequest("https://forum.example/api/qq/settings?provider=official", { method: "DELETE" }), {} as never);
    expect(await response.json()).toEqual({ unbound: true });
    expect(mocks.officialDelete).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.personalDelete).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      details: { source: "ACCOUNT_SETTINGS", provider: "QQ_OFFICIAL" },
    }) });
  });

  it("rejects an unscoped unbind request", async () => {
    const response = await DELETE(new NextRequest("https://forum.example/api/qq/settings", { method: "DELETE" }), {} as never);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
