import { describe, expect, it } from "vitest";

import {
  decryptQQIdentity,
  decryptQQOfficialIdentity,
  encryptQQIdentity,
  encryptQQOfficialIdentity,
  hashQQIdentity,
  hashQQOfficialIdentity,
  normalizeQQIdentity,
  normalizeQQOfficialIdentity,
} from "./qq-identity";

const encryptionKey = Buffer.alloc(32, 1);
const hmacKey = Buffer.alloc(32, 2);

describe("QQ identity crypto", () => {
  it("normalizes, encrypts, and decrypts a QQ number", () => {
    const encrypted = encryptQQIdentity(" 12345678 ", encryptionKey, 3);

    expect(decryptQQIdentity(encrypted, encryptionKey)).toBe("12345678");
    expect(encrypted.ciphertext).not.toContain("12345678");
    expect(encrypted.keyVersion).toBe(3);
  });

  it("uses randomized AES-GCM nonces", () => {
    const first = encryptQQIdentity("12345678", encryptionKey, 1);
    const second = encryptQQIdentity("12345678", encryptionKey, 1);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptQQIdentity("12345678", encryptionKey, 1);
    encrypted.ciphertext = `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}`;

    expect(() => decryptQQIdentity(encrypted, encryptionKey)).toThrow(
      "QQ_IDENTITY_DECRYPT_FAILED",
    );
  });

  it("creates a stable keyed lookup hash", () => {
    expect(hashQQIdentity("12345678", hmacKey)).toBe(
      hashQQIdentity(" 12345678 ", hmacKey),
    );
    expect(hashQQIdentity("12345678", hmacKey)).not.toBe(
      hashQQIdentity("12345679", hmacKey),
    );
  });

  it("rejects invalid QQ numbers", () => {
    expect(() => normalizeQQIdentity("01234")).toThrow("QQ_IDENTITY_INVALID");
    expect(() => normalizeQQIdentity("1234")).toThrow("QQ_IDENTITY_INVALID");
  });

  it("encrypts official openids in a separate lookup namespace", () => {
    const openid = "openid_Abc-123";
    const encrypted = encryptQQOfficialIdentity(openid, encryptionKey, 3);
    expect(decryptQQOfficialIdentity(encrypted, encryptionKey)).toBe(openid);
    expect(hashQQOfficialIdentity(openid, hmacKey)).not.toBe(hashQQIdentity("12345678", hmacKey));
    expect(() => normalizeQQOfficialIdentity("openid with spaces")).toThrow("QQ_OFFICIAL_IDENTITY_INVALID");
  });
});
