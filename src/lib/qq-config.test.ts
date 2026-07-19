import { describe, expect, it } from "vitest";

import { QQ_DEFAULT_GRANT_TTL_SECONDS, parseQQConfig } from "./qq-config";

const baseEnv = {
  QQ_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64url"),
  QQ_IDENTITY_HMAC_KEY: Buffer.alloc(32, 2).toString("base64url"),
  QQ_GRANT_HMAC_KEY: Buffer.alloc(32, 3).toString("base64url"),
};

describe("QQ config", () => {
  it("parses keys and stable defaults", () => {
    const config = parseQQConfig(baseEnv);

    expect(config.identityEncryptionKey).toEqual(Buffer.alloc(32, 1));
    expect(config.identityHmacKey).toEqual(Buffer.alloc(32, 2));
    expect(config.grantHmacKey).toEqual(Buffer.alloc(32, 3));
    expect(config.keyVersion).toBe(1);
    expect(config.grantTtlSeconds).toBe(QQ_DEFAULT_GRANT_TTL_SECONDS);
  });

  it("accepts explicit integer settings and hex keys", () => {
    const config = parseQQConfig({
      ...baseEnv,
      QQ_IDENTITY_ENCRYPTION_KEY: "ab".repeat(32),
      QQ_IDENTITY_KEY_VERSION: "4",
      QQ_GRANT_TTL_SECONDS: "120",
    });

    expect(config.identityEncryptionKey).toEqual(Buffer.alloc(32, 0xab));
    expect(config.keyVersion).toBe(4);
    expect(config.grantTtlSeconds).toBe(120);
  });

  it("rejects missing and malformed keys", () => {
    expect(() => parseQQConfig({})).toThrow(
      "QQ_CONFIG_MISSING_IDENTITY_ENCRYPTION_KEY",
    );
    expect(() =>
      parseQQConfig({ ...baseEnv, QQ_IDENTITY_HMAC_KEY: "short" }),
    ).toThrow("QQ_CONFIG_INVALID_IDENTITY_HMAC_KEY");
  });

  it("rejects ambiguous numeric settings", () => {
    expect(() =>
      parseQQConfig({ ...baseEnv, QQ_GRANT_TTL_SECONDS: "1e3" }),
    ).toThrow("QQ_CONFIG_INVALID_GRANT_TTL_SECONDS");
  });
});
