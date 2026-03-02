import crypto from "crypto";
import redis from "@/lib/redis";
import { getSmsProvider } from "@/lib/sms";

/**
 * 生成 6 位安全随机数字验证码
 * 使用 crypto.randomInt 确保密码学安全
 */
export async function generateCode(): Promise<string> {
  const code = crypto.randomInt(0, 1000000);
  return code.toString().padStart(6, "0");
}

/**
 * 发送验证码到指定手机号
 * - 检查 60 秒频率限制
 * - 测试模式使用固定码 "888888"
 * - 验证码存储在 Redis，TTL 300 秒
 */
export async function sendVerificationCode(
  phone: string,
  purpose: string
): Promise<{ success: boolean; error?: string }> {
  // 检查频率限制
  const limitKey = `sms:limit:${phone}`;
  const limited = await redis.get(limitKey);
  if (limited) {
    return { success: false, error: "请求过于频繁，请稍后再试" };
  }

  // 测试模式使用固定验证码，否则生成随机码
  const isTestMode = process.env.SMS_TEST_MODE === "true";
  const code = isTestMode ? "888888" : await generateCode();

  // 存储验证码到 Redis，TTL 300 秒
  const codeKey = `sms:${purpose}:${phone}`;
  await redis.set(codeKey, code, "EX", 300);

  // 设置频率限制，60 秒 TTL
  await redis.set(limitKey, "1", "EX", 60);

  // 通过 provider 发送验证码
  const provider = getSmsProvider();
  const sent = await provider.sendCode(phone, code);

  if (!sent) {
    // 发送失败时清理已存储的验证码和频率限制
    await redis.del(codeKey);
    await redis.del(limitKey);
    return { success: false, error: "验证码发送失败，请稍后再试" };
  }

  return { success: true };
}

/**
 * 校验验证码
 * - 从 Redis 读取并比对
 * - 成功后删除验证码（一次性使用）
 */
export async function verifyCode(
  phone: string,
  code: string,
  purpose: string
): Promise<boolean> {
  const codeKey = `sms:${purpose}:${phone}`;
  const storedCode = await redis.get(codeKey);

  if (!storedCode || storedCode !== code) {
    return false;
  }

  // 验证成功，删除验证码
  await redis.del(codeKey);
  return true;
}
