import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { createHash, randomBytes } from "crypto";

/**
 * 生成匿名 ID（用于心理区和 DCR 区匿名标识）
 * 格式: "匿名用户_XXXX" (4 位随机十六进制)
 */
export function generateAnonymousId(): string {
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `匿名用户_${suffix}`;
}

/**
 * 对 IP 地址进行 SHA-256 单向哈希处理
 * 不存储明文 IP，满足最小化数据原则
 */
export function hashIP(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * 格式化日期为中文友好格式
 * - 1 分钟内: "刚刚"
 * - 1 小时内: "X 分钟前"
 * - 24 小时内: "X 小时前"
 * - 7 天内: "X 天前"
 * - 超过 7 天: "YYYY-MM-DD"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "刚刚";
  if (diffHours < 1) return `${diffMinutes} 分钟前`;
  if (diffDays < 1) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 截取文本摘要（按字符数截取，保留完整词/字）
 */
export function truncateText(text: string, maxLength: number = 60): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

/**
 * 生成安全的随机邀请码
 */
export function generateInviteCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * 计算账号年龄（天数）
 */
export function getAccountAgeDays(createdAt: Date | string): number {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
