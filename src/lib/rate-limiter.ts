import redis from "@/lib/redis";
import { hashIP } from "@/lib/utils";

/** Default rate limit: 60 requests per 60-second window */
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60 * 1000;

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

  // Atomic pipeline: remove expired → count → conditionally add
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  const results = await pipeline.exec();

  // results[1] = [err, count]
  const currentCount = (results?.[1]?.[1] as number) ?? 0;

  if (currentCount >= limit) {
    // Over limit – find the oldest entry to compute reset time
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const resetAt =
      oldest.length >= 2 ? Number(oldest[1]) + windowMs : now + windowMs;

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit,
    };
  }

  // Under limit – record this request
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  const addPipeline = redis.pipeline();
  addPipeline.zadd(key, now, member);
  addPipeline.pexpire(key, windowMs);
  await addPipeline.exec();

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
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
