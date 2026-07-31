import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), deleteObject: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = { identityVerificationApplication: { updateMany: mocks.updateMany } };
  return { default: {
    identityVerificationApplication: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } };
});
vi.mock("@/lib/audit", () => ({
  AuditAction: { IDENTITY_APPLICATION_CANCEL: "IDENTITY_APPLICATION_CANCEL" },
  AuditTargetType: { IDENTITY_APPLICATION: "IDENTITY_APPLICATION" },
  logAudit: mocks.audit,
}));
vi.mock("@/lib/oss", () => ({ deleteSensitiveObject: mocks.deleteObject, uploadSensitiveObject: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { DELETE } from "./route";

describe("DELETE /api/identity-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1", role: "USER", phone: "13800000000" } } as never);
    mocks.findFirst.mockResolvedValue({ id: "application-1", method: "STUDENT_DOCUMENT", evidenceKey: "identity-verification/application-1/evidence.webp" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteObject.mockResolvedValue(undefined);
  });

  it("returns Gone without mutating historical identity data", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/identity-verification", { method: "DELETE" }), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe("身份认证功能已下线");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
