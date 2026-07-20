import { createHmac, randomBytes } from "node:crypto";

export const QQ_GRANT_TOKEN_PREFIX = "qqg_";
export const QQ_GRANT_PURPOSES = [
  "IDENTITY_BIND",
  "REGISTRATION_FINALIZE",
  "DELEGATION_SUBMIT",
  "CASE_REVIEW",
  "TASK_PUBLISH",
] as const;

export type QQGrantPurpose = (typeof QQ_GRANT_PURPOSES)[number];

export interface QQGrantConsumeWhere {
  tokenHash: string;
  purpose: QQGrantPurpose;
  consumedAt: null;
  revokedAt: null;
  expiresAt: { gt: Date };
}

export interface QQGrantAtomicStore {
  updateMany(args: {
    where: QQGrantConsumeWhere;
    data: { consumedAt: Date };
  }): Promise<{ count: number }>;
}

function assertHmacKey(key: Uint8Array): void {
  if (key.byteLength !== 32) throw new Error("QQ_GRANT_INVALID_HMAC_KEY");
}

export function generateQQGrant(): string {
  return `${QQ_GRANT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashQQGrant(token: string, hmacKey: Uint8Array): string {
  assertHmacKey(hmacKey);
  if (!/^qqg_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("QQ_GRANT_INVALID_TOKEN");
  return createHmac("sha256", hmacKey).update(token, "utf8").digest("base64url");
}

export function buildQQGrantConsumeWhere(
  tokenHash: string,
  purpose: QQGrantPurpose,
  now: Date,
): QQGrantConsumeWhere {
  if (!QQ_GRANT_PURPOSES.includes(purpose)) throw new Error("QQ_GRANT_INVALID_PURPOSE");
  if (!tokenHash) throw new Error("QQ_GRANT_INVALID_HASH");
  if (Number.isNaN(now.getTime())) throw new Error("QQ_GRANT_INVALID_TIME");

  return {
    tokenHash,
    purpose,
    consumedAt: null,
    revokedAt: null,
    expiresAt: { gt: now },
  };
}

export async function consumeQQGrantAtomically(
  store: QQGrantAtomicStore,
  token: string,
  purpose: QQGrantPurpose,
  hmacKey: Uint8Array,
  now = new Date(),
): Promise<boolean> {
  const result = await store.updateMany({
    where: buildQQGrantConsumeWhere(hashQQGrant(token, hmacKey), purpose, now),
    data: { consumedAt: now },
  });
  return result.count === 1;
}
