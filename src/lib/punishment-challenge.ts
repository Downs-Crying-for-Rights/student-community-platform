import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1000;

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required for punishment challenges");
  return value;
}

export function createPunishmentChallenge(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: now + MAX_AGE_MS })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPunishmentChallenge(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.userId === "string" && typeof parsed.expiresAt === "number" && parsed.expiresAt > now ? parsed.userId : null;
  } catch {
    return null;
  }
}
