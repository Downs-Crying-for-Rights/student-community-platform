import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import redis from "@/lib/redis";

const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const API_BASE_URL = "https://api.sgroup.qq.com";
const PRIVATE_KEY_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const MAX_CLOCK_SKEW_SECONDS = 10 * 60;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export interface QQOfficialConfig {
  enabled: boolean;
  appId: string;
  clientSecret: string;
  configured: boolean;
}

function enabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function getQQOfficialConfig(): QQOfficialConfig {
  const appId = process.env.QQ_OFFICIAL_BOT_APP_ID?.trim() ?? "";
  const clientSecret = process.env.QQ_OFFICIAL_BOT_CLIENT_SECRET?.trim() ?? "";
  return {
    enabled: enabled(process.env.QQ_OFFICIAL_BOT_ENABLED),
    appId,
    clientSecret,
    configured: /^\d{5,20}$/.test(appId) && clientSecret.length >= 8,
  };
}

function derivePrivateKey(secret: string) {
  const source = Buffer.from(secret, "utf8");
  if (source.length === 0) throw new Error("QQ official bot secret is missing");

  const seed = Buffer.alloc(32);
  for (let offset = 0; offset < seed.length; offset += source.length) {
    source.copy(seed, offset, 0, Math.min(source.length, seed.length - offset));
  }
  return createPrivateKey({
    key: Buffer.concat([PRIVATE_KEY_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function signQQOfficialChallenge(
  secret: string,
  eventTimestamp: string,
  plainToken: string,
): string {
  return sign(null, Buffer.from(`${eventTimestamp}${plainToken}`), derivePrivateKey(secret)).toString("hex");
}

export function verifyQQOfficialSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  now?: number;
}): boolean {
  if (!/^\d{10,13}$/.test(input.timestamp) || !/^[a-fA-F0-9]{128}$/.test(input.signature)) {
    return false;
  }
  const timestampSeconds = Number(input.timestamp.slice(0, 10));
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1_000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  try {
    return verify(
      null,
      Buffer.from(`${input.timestamp}${input.body}`),
      createPublicKey(derivePrivateKey(input.secret)),
      Buffer.from(input.signature, "hex"),
    );
  } catch {
    return false;
  }
}

export async function getQQOfficialAccessToken(forceRefresh = false): Promise<string> {
  const config = getQQOfficialConfig();
  if (!config.configured) throw new Error("QQ_OFFICIAL_NOT_CONFIGURED");
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: config.appId, clientSecret: config.clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const data = await response.json().catch(() => null) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  const expiresIn = Number(data?.expires_in);
  if (!response.ok || typeof data?.access_token !== "string" || !Number.isFinite(expiresIn)) {
    throw new Error("QQ_OFFICIAL_AUTH_FAILED");
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1_000,
  };
  return tokenCache.token;
}

export async function sendQQOfficialReply(input: {
  targetType: "user" | "group";
  targetId: string;
  messageId: string;
  content: string;
}): Promise<void> {
  const path = input.targetType === "user"
    ? `/v2/users/${encodeURIComponent(input.targetId)}/messages`
    : `/v2/groups/${encodeURIComponent(input.targetId)}/messages`;
  const body = JSON.stringify({ content: input.content, msg_type: 0, msg_id: input.messageId, msg_seq: 1 });
  async function send(forceRefresh: boolean) {
    const token = await getQQOfficialAccessToken(forceRefresh);
    return fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(4_500),
    });
  }

  let response = await send(false);
  if (response.status === 401 || response.status === 403) response = await send(true);
  if (!response.ok) throw new Error("QQ_OFFICIAL_SEND_FAILED");
}

export type QQOfficialEventReservation =
  | { status: "ACQUIRED"; leaseToken: string }
  | { status: "IN_PROGRESS" }
  | { status: "DELIVERED" };

export async function recordQQOfficialEvent(eventId: string): Promise<QQOfficialEventReservation> {
  const leaseToken = randomUUID();
  const result = await redis.eval(
    `if redis.call("EXISTS", KEYS[1]) == 1 then return "DELIVERED" end
     if redis.call("SET", KEYS[2], ARGV[1], "EX", 60, "NX") then return "ACQUIRED" end
     return "IN_PROGRESS"`,
    2,
    `qq-official:event:delivered:${eventId}`,
    `qq-official:event:processing:${eventId}`,
    leaseToken,
  );
  return result === "ACQUIRED"
    ? { status: "ACQUIRED", leaseToken }
    : { status: result === "DELIVERED" ? "DELIVERED" : "IN_PROGRESS" };
}

export async function completeQQOfficialEvent(eventId: string, eventType: string, leaseToken: string): Promise<boolean> {
  const completed = await redis.eval(
    `if redis.call("GET", KEYS[2]) ~= ARGV[1] then return 0 end
     redis.call("SET", KEYS[1], "1", "EX", 86400)
     redis.call("DEL", KEYS[2])
     return 1`,
    2,
    `qq-official:event:delivered:${eventId}`,
    `qq-official:event:processing:${eventId}`,
    leaseToken,
  );
  if (completed !== 1) return false;
  await redis.set("qq-official:last-event", JSON.stringify({ eventType, receivedAt: new Date().toISOString() }), "EX", 604_800).catch(() => null);
  return true;
}

export async function releaseQQOfficialEvent(eventId: string, leaseToken: string): Promise<void> {
  await redis.eval(
    `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end
     return 0`,
    1,
    `qq-official:event:processing:${eventId}`,
    leaseToken,
  );
}

export async function getQQOfficialLastEvent(): Promise<{ eventType: string; receivedAt: string } | null> {
  const value = await redis.get("qq-official:last-event");
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return typeof parsed.eventType === "string" && typeof parsed.receivedAt === "string"
      ? { eventType: parsed.eventType, receivedAt: parsed.receivedAt }
      : null;
  } catch {
    return null;
  }
}

export function resetQQOfficialTokenForTests(): void {
  tokenCache = null;
}
