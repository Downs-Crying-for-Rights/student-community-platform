import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function aad(context: string, keyVersion: number): Buffer {
  if (!/^[a-z0-9:_-]{3,240}$/i.test(context)) throw new Error("ENVELOPE_INVALID_CONTEXT");
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("ENVELOPE_INVALID_KEY_VERSION");
  return Buffer.from(`dcr-envelope:v1:${context}:${keyVersion}`, "utf8");
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== 32) throw new Error("ENVELOPE_INVALID_KEY");
}

export function encryptEnvelope(plaintext: string, key: Uint8Array, keyVersion: number, context: string): EncryptedEnvelope {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(aad(context, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    keyVersion,
  };
}

export function decryptEnvelope(envelope: EncryptedEnvelope, key: Uint8Array, context: string): string {
  assertKey(key);
  const iv = Buffer.from(envelope.iv, "base64url");
  const authTag = Buffer.from(envelope.authTag, "base64url");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) throw new Error("ENVELOPE_INVALID_CIPHERTEXT");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(aad(context, envelope.keyVersion));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("ENVELOPE_DECRYPT_FAILED");
  }
}
