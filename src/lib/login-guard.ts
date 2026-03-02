import redis from "./redis";
import { createNotification } from "./notification";

/** Redis key for tracking login IP hashes per user (sorted set) */
function loginIpsKey(userId: string): string {
  return `login:ips:${userId}`;
}

/** Redis key for account lock status */
function loginLockedKey(userId: string): string {
  return `login:locked:${userId}`;
}

/** Time window for anomalous login detection (5 minutes in seconds) */
const DETECTION_WINDOW_SEC = 5 * 60;

/** Minimum distinct IP hashes within the window to trigger a lock */
const IP_THRESHOLD = 3;

/** Account lock duration (30 minutes in seconds) */
const LOCK_TTL_SEC = 30 * 60;

/**
 * Record a login attempt and check for anomalous activity.
 *
 * Adds the IP hash to a Redis sorted set keyed by userId with the current
 * timestamp as score. If 3+ distinct IP hashes appear within the last 5
 * minutes the account is temporarily locked for 30 minutes and an Admin
 * notification is created.
 *
 * Validates: Requirements 19.7
 */
export async function recordLoginAttempt(
  userId: string,
  ipHash: string,
): Promise<{ locked: boolean }> {
  const now = Date.now();
  const windowStart = now - DETECTION_WINDOW_SEC * 1000;
  const ipsKey = loginIpsKey(userId);

  // Remove entries older than the detection window
  await redis.zremrangebyscore(ipsKey, "-inf", windowStart);

  // Add current IP hash (score = timestamp). If the same IP hash already
  // exists the score is updated but the member count stays the same.
  await redis.zadd(ipsKey, now, ipHash);

  // Set expiry on the key so it auto-cleans
  await redis.expire(ipsKey, DETECTION_WINDOW_SEC);

  // Count distinct IP hashes in the window
  const distinctCount = await redis.zcard(ipsKey);

  if (distinctCount >= IP_THRESHOLD) {
    const lockedKey = loginLockedKey(userId);
    await redis.set(lockedKey, "1", "EX", LOCK_TTL_SEC);

    // Notify all admins — we use a best-effort approach here.
    // The caller can also handle admin notification if needed.
    try {
      await createNotification(
        userId,
        "SYSTEM",
        "账户异常登录检测",
        `检测到 ${distinctCount} 个不同 IP 在 5 分钟内登录此账户，账户已临时锁定 30 分钟。`,
      );
    } catch {
      // Notification failure should not block the lock
    }

    return { locked: true };
  }

  return { locked: false };
}

/**
 * Check whether an account is currently locked due to anomalous login
 * activity.
 *
 * Validates: Requirements 19.7
 */
export async function isAccountLocked(userId: string): Promise<boolean> {
  const result = await redis.get(loginLockedKey(userId));
  return result === "1";
}
