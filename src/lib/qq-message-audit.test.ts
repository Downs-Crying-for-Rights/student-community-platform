import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/qq-config", () => ({ getQQConfig: () => ({ identityEncryptionKey: Buffer.alloc(32, 5), keyVersion: 2 }) }));
import { decryptQQAuditValue, encryptQQAuditValue, redactSensitiveQQText } from "./qq-message-audit";

describe("QQ message audit", () => {
  it("encrypts structured content and separates contexts", () => {
    const value = encryptQQAuditValue({ text: "帮助" }, "qq-inbox-input:event-1");
    expect(decryptQQAuditValue(value, "qq-inbox-input:event-1")).toEqual({ text: "帮助" });
    expect(() => decryptQQAuditValue(value, "qq-inbox-replies:event-1")).toThrow();
  });

  it("redacts grants, query credentials, bearer tokens, and API keys", () => {
    const text = redactSensitiveQQText("https://a.test/qq?token=qqg_secret Authorization: Bearer abc sk-123456789");
    expect(text).not.toMatch(/qqg_secret|Bearer abc|sk-123456789/);
    expect(text).toContain("[REDACTED]");
  });
});
