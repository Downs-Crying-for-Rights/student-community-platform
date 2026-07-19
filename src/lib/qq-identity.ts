import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const QQ_NUMBER_PATTERN = /^[1-9]\d{4,11}$/;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface EncryptedQQIdentity {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== 32) throw new Error("QQ_IDENTITY_INVALID_KEY");
}

function additionalData(keyVersion: number): Buffer {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error("QQ_IDENTITY_INVALID_KEY_VERSION");
  }
  return Buffer.from(`qq-identity:v1:${keyVersion}`, "utf8");
}

export function normalizeQQIdentity(value: string): string {
  const normalized = value.trim();
  if (!QQ_NUMBER_PATTERN.test(normalized)) throw new Error("QQ_IDENTITY_INVALID");
  return normalized;
}

export function hashQQIdentity(value: string, hmacKey: Uint8Array): string {
  assertKey(hmacKey);
  return createHmac("sha256", hmacKey)
    .update(normalizeQQIdentity(value), "utf8")
    .digest("base64url");
}

export function encryptQQIdentity(
  value: string,
  encryptionKey: Uint8Array,
  keyVersion: number,
): EncryptedQQIdentity {
  assertKey(encryptionKey);
  const aad = additionalData(keyVersion);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(normalizeQQIdentity(value), "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    keyVersion,
  };
}

export function decryptQQIdentity(
  encrypted: EncryptedQQIdentity,
  encryptionKey: Uint8Array,
): string {
  assertKey(encryptionKey);
  const aad = additionalData(encrypted.keyVersion);
  const iv = Buffer.from(encrypted.iv, "base64url");
  const authTag = Buffer.from(encrypted.authTag, "base64url");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64url");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("QQ_IDENTITY_INVALID_CIPHERTEXT");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return normalizeQQIdentity(plaintext);
  } catch {
    throw new Error("QQ_IDENTITY_DECRYPT_FAILED");
  }
}
