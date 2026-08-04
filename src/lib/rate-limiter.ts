import redis from "@/lib/redis";
import { hashIP } from "@/lib/utils";
import { randomBytes } from "node:crypto";

/** Default rate limit: 60 requests per 60-second window */
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60 * 1000;

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
local member = ARGV[5]

redis.call("ZREMRANGEBYSCORE", key, 0, window_start)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  return {0, count, oldest[2] or 0}
end

redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, window_ms)
return {1, count + 1, 0}
`;

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
  /** Total limit for the window */
  limit: number;
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 *
 * Algorithm:
 *  1. Remove entries older than the window
 *  2. Count current entries
 *  3. If under limit, add a new entry with the current timestamp as score
 *  4. Set TTL on the key so it auto-expires
 *
 * @param identifier - Unique key suffix (userId or hashed IP)
 * @param limit      - Max requests allowed in the window (default 60)
 * @param windowMs   - Window size in milliseconds (default 60 000)
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${identifier}`;

  const member = `${now}:${randomBytes(8).toString("hex")}`;
  const raw = await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    key,
    String(now),
    String(windowStart),
    String(windowMs),
    String(limit),
    member,
  );
  if (!Array.isArray(raw) || raw.length < 3) throw new Error("RATE_LIMIT_SCRIPT_INVALID_RESULT");
  const allowed = Number(raw[0]) === 1;
  const count = Number(raw[1]);
  const oldestScore = Number(raw[2]);

  if (!allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestScore > 0 ? oldestScore + windowMs : now + windowMs,
      limit,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs,
    limit,
  };
}

/**
 * Build a rate-limit key for an authenticated user.
 */
export function rateLimitKeyForUser(userId: string): string {
  return userId;
}

/**
 * Build a rate-limit key for an unauthenticated request (by IP).
 * The IP is hashed before use so no plaintext IP is stored in Redis.
 */
export function rateLimitKeyForIP(ip: string): string {
  return `ip:${hashIP(ip)}`;
}

/** Resolve the client IP set by the trusted reverse proxy. */
export function requestIP(request: Pick<Request, "headers">): string {
  return request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

/**
 * Convenience wrapper: check rate limit and return a Response when exceeded.
 * Returns `null` when the request is allowed, or a 429 Response otherwise.
 */
export async function enforceRateLimit(
  identifier: string,
  limit?: number,
  windowMs?: number,
): Promise<{ response: Response; result: RateLimitResult } | null> {
  const result = await checkRateLimit(identifier, limit, windowMs);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    const response = new Response(
      JSON.stringify({
        error: "Too Many Requests",
        message: "请求过于频繁，请稍后再试",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      },
    );
    return { response, result };
  }

  return null;
}
