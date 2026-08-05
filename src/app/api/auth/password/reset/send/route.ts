import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { phoneSchema } from "@/lib/validators";
import { sendVerificationCode } from "@/lib/sms/verification";
import { enforceRateLimit, rateLimitKeyForIP, requestIP } from "@/lib/rate-limiter";
import { withTelemetry } from "@/lib/telemetry";
import { validateCaptchaProof } from "@/lib/captcha";

const requestSchema = z.object({
  phone: phoneSchema,
  captchaProof: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
}).strict();

function phoneKey(phone: string) {
  return createHash("sha256").update(phone).digest("hex");
}

const post = async (request: NextRequest) => {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "手机号或图形验证码参数无效" }, { status: 400 });
    }
    const { phone, captchaProof } = parsed.data;
    if (!await validateCaptchaProof(captchaProof, "password-reset", phone)) {
      return NextResponse.json({ error: "图形验证码错误或已过期" }, { status: 400 });
    }
    const limits = await Promise.all([
      enforceRateLimit(`password-reset-send:${rateLimitKeyForIP(requestIP(request))}`, 10, 60 * 60 * 1000),
      enforceRateLimit(`password-reset-send:phone:${phoneKey(phone)}`, 3, 60 * 60 * 1000),
    ]);
    if (limits.some(Boolean)) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, isBanned: true } });
    if (user && !user.isBanned) {
      const result = await sendVerificationCode(phone, "reset-password");
      if (!result.success && result.error === "请求过于频繁，请稍后再试") {
        return NextResponse.json({ error: result.error }, { status: 429 });
      }
      if (!result.success) {
        return NextResponse.json({ error: "验证码发送失败，请稍后再试" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "如果该手机号已绑定账户，验证码将发送到该手机" });
  } catch (error) {
    console.error("POST /api/auth/password/reset/send error:", error);
    return NextResponse.json({ error: "验证码发送失败，请稍后再试" }, { status: 500 });
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/password/reset/send" });
