import redis from "@/lib/redis";
import { sendUserMail } from "@/lib/mail";
import { generateCode } from "@/lib/sms/verification";
import { checkRateLimit } from "@/lib/rate-limiter";
import { isEmailVerificationTestMode } from "@/lib/email-verification-test-mode";

const PURPOSE = "account-deletion";

const codeKey = (userId: string) => `email-code:${PURPOSE}:${userId}`;
const limitKey = (userId: string) => `email-code-limit:${PURPOSE}:${userId}`;

export async function sendAccountDeletionEmailCode(userId: string) {
  if (await redis.get(limitKey(userId))) {
    return { success: false, error: "请求过于频繁，请稍后再试" };
  }
  const hourly = await checkRateLimit(`email-code:${PURPOSE}:${userId}`, 5, 60 * 60 * 1000);
  if (!hourly.allowed) {
    return { success: false, error: "验证码发送次数已达上限，请稍后再试" };
  }

  const code = isEmailVerificationTestMode() ? "888888" : await generateCode();
  await redis.set(codeKey(userId), code, "EX", 300);
  await redis.set(limitKey(userId), "1", "EX", 60);
  const result = await sendUserMail({
    userId,
    subject: "账号注销验证码",
    text: `你正在申请注销账号，验证码为：${code}\n\n验证码 5 分钟内有效。若非本人操作，请忽略本邮件并及时修改密码。`,
  });
  if (!result.sent) {
    await Promise.all([redis.del(codeKey(userId)), redis.del(limitKey(userId))]);
    return { success: false, error: result.reason === "user_has_no_email" ? "账号未绑定邮箱" : "验证码发送失败，请稍后再试" };
  }
  return { success: true };
}

export async function verifyAccountDeletionEmailCode(userId: string, code: string) {
  if (isEmailVerificationTestMode() && code === "888888") return true;
  const key = codeKey(userId);
  const stored = await redis.get(key);
  if (!stored || stored !== code) return false;
  await redis.del(key);
  return true;
}
