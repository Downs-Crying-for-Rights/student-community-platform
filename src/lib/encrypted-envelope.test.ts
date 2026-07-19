import { describe, expect, it } from "vitest";
import { decryptEnvelope, encryptEnvelope } from "./encrypted-envelope";

describe("encrypted envelope", () => {
  const key = Buffer.alloc(32, 7);

  it("round trips with random nonces and context isolation", () => {
    const first = encryptEnvelope("secret", key, 1, "ai-runtime-api-key");
    const second = encryptEnvelope("secret", key, 1, "ai-runtime-api-key");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptEnvelope(first, key, "ai-runtime-api-key")).toBe("secret");
    expect(() => decryptEnvelope(first, key, "qq-inbox-input:event")).toThrow("ENVELOPE_DECRYPT_FAILED");
  });

  it("rejects tampered ciphertext", () => {
    const value = encryptEnvelope("secret", key, 1, "test-context");
    value.ciphertext = `${value.ciphertext[0] === "A" ? "B" : "A"}${value.ciphertext.slice(1)}`;
    expect(() => decryptEnvelope(value, key, "test-context")).toThrow("ENVELOPE_DECRYPT_FAILED");
  });
});
