/**
 * 统一系统日志工具
 *
 * 将 info/debug/warn/error 日志写入 SystemLog 表，同时 console 输出。
 * 失败时静默降级（仅 console.error），不阻塞业务流程。
 */

import prisma from "./prisma";

export type LogSource =
  | "app"
  | "auth"
  | "post"
  | "case"
  | "dcr"
  | "psych"
  | "kb"
  | "admin"
  | "middleware"
  | "api"
  | "sms"
  | "upload";

interface LogOptions {
  /** 日志来源 */
  source?: LogSource;
  /** JSON 序列化的详情 */
  detail?: Record<string, unknown>;
  /** 请求 IP */
  ip?: string;
  /** 关联用户 ID */
  userId?: string;
}

async function writeLog(
  level: "DEBUG" | "INFO" | "WARN" | "ERROR",
  message: string,
  options?: LogOptions,
): Promise<void> {
  const { source = "app", detail, ip, userId } = options ?? {};

  // Console output (always)
  const prefix = `[${level}] ${source}`;
  switch (level) {
    case "ERROR":
      console.error(prefix, message, detail ?? "");
      break;
    case "WARN":
      console.warn(prefix, message, detail ?? "");
      break;
    default:
      console.log(prefix, message, detail ?? "");
  }

  // Database persistence (best-effort)
  try {
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message,
        detail: detail ? JSON.stringify(detail) : null,
        ip: ip ?? null,
        userId: userId ?? null,
      },
    });
  } catch (err) {
    // Fail silently — don't let log failures break business logic
    console.error("[logger] Failed to persist log to DB:", err);
  }
}

export const logger = {
  debug(message: string, options?: LogOptions) {
    return writeLog("DEBUG", message, options);
  },
  info(message: string, options?: LogOptions) {
    return writeLog("INFO", message, options);
  },
  warn(message: string, options?: LogOptions) {
    return writeLog("WARN", message, options);
  },
  error(message: string, options?: LogOptions) {
    return writeLog("ERROR", message, options);
  },
};

/**
 * 记录 API 请求日志（中间件用）
 */
export async function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  ip?: string,
  userId?: string,
): Promise<void> {
  const level = statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARN" : "INFO";
  await writeLog(level, `${method} ${path} → ${statusCode} (${durationMs}ms)`, {
    source: "api",
    detail: { method, path, statusCode, durationMs },
    ip,
    userId,
  });
}
