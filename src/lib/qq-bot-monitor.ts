import redis from "@/lib/redis";

const HEARTBEAT_KEY = "qq-bot:worker:heartbeat";
export const QQ_BOT_HEARTBEAT_TTL_SECONDS = 30;

export interface QQBotHeartbeat {
  selfId: string;
  recordedAt: string;
  oneBotConnected: boolean;
  accountOnline: boolean;
  checkedAt: string;
}

export async function recordQQBotHeartbeat(
  selfId: string,
  status: Pick<QQBotHeartbeat, "oneBotConnected" | "accountOnline" | "checkedAt">,
  now = new Date(),
): Promise<void> {
  const heartbeat: QQBotHeartbeat = { selfId, recordedAt: now.toISOString(), ...status };
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
    if (typeof parsed.selfId !== "string" || typeof parsed.recordedAt !== "string" ||
      typeof parsed.oneBotConnected !== "boolean" || typeof parsed.accountOnline !== "boolean" ||
      typeof parsed.checkedAt !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.recordedAt)) || Number.isNaN(Date.parse(parsed.checkedAt))) return null;
    return parsed as QQBotHeartbeat;
  } catch {
    return null;
  }
}
