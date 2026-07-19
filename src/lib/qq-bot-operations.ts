import { randomUUID } from "node:crypto";

import redis from "@/lib/redis";

const COMMAND_KEY = "qq-bot:operations:command";
const RESULT_KEY = "qq-bot:operations:result";
const COMMAND_TTL_SECONDS = 120;
const RESULT_TTL_SECONDS = 300;

export const QQ_BOT_OPERATION_ACTIONS = ["RESTART_WORKER", "RESTART_NAPCAT", "REFRESH_LOGIN"] as const;
export type QQBotOperationAction = (typeof QQ_BOT_OPERATION_ACTIONS)[number];

export interface QQBotOperationCommand {
  id: string;
  action: QQBotOperationAction;
  requestedAt: string;
}

export interface QQBotOperationResult {
  commandId: string;
  action: QQBotOperationAction;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  updatedAt: string;
  message: string;
  login?: {
    isLogin: boolean;
    isOffline: boolean;
    qrcode: string | null;
    captchaUrl: string | null;
    deviceVerificationUrl: string | null;
    loginError: string | null;
    smsSupported: false;
  };
}

export async function enqueueQQBotOperation(action: QQBotOperationAction): Promise<QQBotOperationCommand | null> {
  const command = { id: randomUUID(), action, requestedAt: new Date().toISOString() };
  const initialResult = JSON.stringify({
    commandId: command.id,
    action,
    status: "RUNNING",
    updatedAt: command.requestedAt,
    message: "操作已提交，等待 Worker 执行",
  } satisfies QQBotOperationResult);
  const acquired = await redis.eval(
    `if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
     redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[4])
     redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
     return 1`,
    2,
    COMMAND_KEY,
    RESULT_KEY,
    JSON.stringify(command),
    initialResult,
    String(COMMAND_TTL_SECONDS),
    String(RESULT_TTL_SECONDS),
  );
  if (acquired !== 1) return null;
  return command;
}

export async function claimQQBotOperation(): Promise<QQBotOperationCommand | null> {
  const raw = await redis.getdel(COMMAND_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<QQBotOperationCommand>;
  if (typeof value.id !== "string" || typeof value.requestedAt !== "string" ||
    !QQ_BOT_OPERATION_ACTIONS.includes(value.action as QQBotOperationAction)) return null;
  return value as QQBotOperationCommand;
}

export async function recordQQBotOperationResult(result: QQBotOperationResult): Promise<void> {
  await redis.set(RESULT_KEY, JSON.stringify(result), "EX", RESULT_TTL_SECONDS);
}

export async function getQQBotOperationResult(): Promise<QQBotOperationResult | null> {
  const raw = await redis.get(RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QQBotOperationResult;
  } catch {
    return null;
  }
}
