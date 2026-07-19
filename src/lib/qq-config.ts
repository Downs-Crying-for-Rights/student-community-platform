export const QQ_DEFAULT_GRANT_TTL_SECONDS = 15 * 60;

export interface QQConfig {
  identityEncryptionKey: Buffer;
  identityHmacKey: Buffer;
  grantHmacKey: Buffer;
  keyVersion: number;
  grantTtlSeconds: number;
}

export type QQConfigEnvironment = Partial<
  Record<
    | "QQ_IDENTITY_ENCRYPTION_KEY"
    | "QQ_IDENTITY_HMAC_KEY"
    | "QQ_GRANT_HMAC_KEY"
    | "QQ_IDENTITY_KEY_VERSION"
    | "QQ_GRANT_TTL_SECONDS",
    string
  >
>;

function parseKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new Error(`QQ_CONFIG_MISSING_${name}`);

  const encoding = /^[0-9a-f]{64}$/i.test(value) ? "hex" : "base64url";
  const key = Buffer.from(value, encoding);
  if (key.length !== 32) throw new Error(`QQ_CONFIG_INVALID_${name}`);
  return key;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`QQ_CONFIG_INVALID_${name}`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`QQ_CONFIG_INVALID_${name}`);
  return parsed;
}

export function parseQQConfig(env: QQConfigEnvironment): QQConfig {
  return {
    identityEncryptionKey: parseKey(
      env.QQ_IDENTITY_ENCRYPTION_KEY,
      "IDENTITY_ENCRYPTION_KEY",
    ),
    identityHmacKey: parseKey(env.QQ_IDENTITY_HMAC_KEY, "IDENTITY_HMAC_KEY"),
    grantHmacKey: parseKey(env.QQ_GRANT_HMAC_KEY, "GRANT_HMAC_KEY"),
    keyVersion: parsePositiveInteger(
      env.QQ_IDENTITY_KEY_VERSION,
      1,
      "IDENTITY_KEY_VERSION",
    ),
    grantTtlSeconds: parsePositiveInteger(
      env.QQ_GRANT_TTL_SECONDS,
      QQ_DEFAULT_GRANT_TTL_SECONDS,
      "GRANT_TTL_SECONDS",
    ),
  };
}

export function getQQConfig(): QQConfig {
  return parseQQConfig({
    QQ_IDENTITY_ENCRYPTION_KEY: process.env.QQ_IDENTITY_ENCRYPTION_KEY,
    QQ_IDENTITY_HMAC_KEY: process.env.QQ_IDENTITY_HMAC_KEY,
    QQ_GRANT_HMAC_KEY: process.env.QQ_GRANT_HMAC_KEY,
    QQ_IDENTITY_KEY_VERSION: process.env.QQ_IDENTITY_KEY_VERSION,
    QQ_GRANT_TTL_SECONDS: process.env.QQ_GRANT_TTL_SECONDS,
  });
}
