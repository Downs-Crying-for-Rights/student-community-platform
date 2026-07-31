import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn(), identityFindUnique: vi.fn(), decrypt: vi.fn(), audit: vi.fn() }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { qQBotEventInbox: { findUnique: mocks.findUnique }, qQIdentity: { findUnique: mocks.identityFindUnique } } }));
vi.mock("@/lib/qq-identity", () => ({ decryptQQIdentity: () => "2153912535" }));
vi.mock("@/lib/qq-config", () => ({ getQQConfig: () => ({ identityEncryptionKey: Buffer.alloc(32, 1) }) }));
vi.mock("@/lib/qq-message-audit", () => ({ decryptQQAuditValue: mocks.decrypt, redactSensitiveQQText: (value: string) => value.replace(/qqg_[A-Za-z0-9_-]+/g, "[REDACTED_GRANT]") }));
vi.mock("@/lib/audit", () => ({ AuditAction: { QQ_MESSAGE_CONTENT_VIEW: "QQ_MESSAGE_CONTENT_VIEW" }, AuditTargetType: { QQ_MESSAGE: "QQ_MESSAGE" }, logAudit: mocks.audit }));

const id = "cm1234567890123456789012";
const request = () => new NextRequest(`http://localhost/api/admin/qq-bot/events/${id}`);

describe("GET QQ event detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id, eventId: "3917673573:1", selfId: "3917673573", response: null, inputCiphertext: "a", inputIv: "b", inputAuthTag: "c", inputKeyVersion: 1, replyCiphertext: "d", replyIv: "e", replyAuthTag: "f", replyKeyVersion: 1, createdAt: new Date(), processedAt: new Date() });
    mocks.identityFindUnique.mockResolvedValue({ ciphertext: "x", iv: "y", authTag: "z", keyVersion: 1, user: { id: "user-1", username: "audit-user", nickname: "测试用户", email: null, role: "USER", isBanned: false, createdAt: new Date() } });
    mocks.decrypt.mockReturnValueOnce({ input: { text: "帮助" } }).mockReturnValueOnce(["https://forum/qq?token=qqg_secret"]);
    mocks.audit.mockResolvedValue({});
  });

  it("denies administrators below SUPER_ADMIN before reading content", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(request(), { params: { id } })).status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("decrypts, redacts, audits, and disables caching", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { GET } = await import("./route");
    const response = await GET(request(), { params: { id } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("qqg_secret");
    expect(body.event.sender).toMatchObject({ qqNumber: "2153912535", username: "audit-user", userId: "user-1", nickname: "测试用户" });
    expect(JSON.stringify(body)).not.toMatch(/lookupHash|ciphertext|authTag/);
    expect(mocks.audit).toHaveBeenCalledWith("root", "QQ_MESSAGE_CONTENT_VIEW", "QQ_MESSAGE", id, expect.objectContaining({ redactionApplied: true }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
