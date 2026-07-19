import redis from "@/lib/redis";
import { sendAdminActionMail } from "@/lib/mail";

const HEARTBEAT_KEY = "qq-bot:worker:heartbeat";
export const QQ_BOT_HEARTBEAT_TTL_SECONDS = 30;

export interface QQBotHeartbeat {
  selfId: string;
  recordedAt: string;
  oneBotConnected: boolean;
  accountOnline: boolean;
  checkedAt: string;
  reconnectAttemptedAt?: string;
  reconnectFailed?: boolean;
}

export async function recordQQBotHeartbeat(
  selfId: string,
  status: Pick<QQBotHeartbeat, "oneBotConnected" | "accountOnline" | "checkedAt"> &
    Partial<Pick<QQBotHeartbeat, "reconnectAttemptedAt" | "reconnectFailed">>,
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

export async function alertQQBotReconnectFailure(
  selfId: string,
  status: Pick<QQBotHeartbeat, "accountOnline" | "reconnectAttemptedAt" | "reconnectFailed">,
): Promise<void> {
  const key = `qq-bot:alert:login-failed:${selfId}`;
  try {
    if (status.accountOnline) {
      await redis.del(key);
      return;
    }
    if (!status.reconnectFailed || !status.reconnectAttemptedAt) return;
    const acquired = await redis.set(key, status.reconnectAttemptedAt, "EX", 21_600, "NX");
    if (acquired !== "OK") return;
  } catch {
    // A Redis failure must not turn a frequent heartbeat into an email storm.
    return;
  }

  const result = await sendAdminActionMail({
    minimumRole: "ADMIN",
    subject: "QQ 机器人自动重连失败",
    text: `机器人 QQ ${selfId} 已尝试自动重连，但账号仍未登录。请尽快检查 NapCat 登录状态并重新扫码。`,
    actionUrl: "/admin/qq-bot",
  });
  if (!result.sent) {
    try {
      await redis.del(key);
    } catch {
      // The next online transition or key expiry will release the alert.
    }
  }
}
