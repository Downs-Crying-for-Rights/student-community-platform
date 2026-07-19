import redis from "@/lib/redis";

const HEARTBEAT_KEY = "qq-bot:worker:heartbeat";
export const QQ_BOT_HEARTBEAT_TTL_SECONDS = 30;

export interface QQBotHeartbeat {
  selfId: string;
  recordedAt: string;
}

export async function recordQQBotHeartbeat(selfId: string, now = new Date()): Promise<void> {
  const heartbeat: QQBotHeartbeat = { selfId, recordedAt: now.toISOString() };
  try {
    await redis.set(HEARTBEAT_KEY, JSON.stringify(heartbeat), "EX", QQ_BOT_HEARTBEAT_TTL_SECONDS);
  } catch {
    // Monitoring must never interrupt message delivery.
  }
}

export async function getQQBotHeartbeat(): Promise<QQBotHeartbeat | null> {
  try {
    const value = await redis.get(HEARTBEAT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<QQBotHeartbeat>;
    if (typeof parsed.selfId !== "string" || typeof parsed.recordedAt !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.recordedAt))) return null;
    return { selfId: parsed.selfId, recordedAt: parsed.recordedAt };
  } catch {
    return null;
  }
}
