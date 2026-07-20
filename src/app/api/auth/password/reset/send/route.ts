import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { phoneSchema } from "@/lib/validators";
import { sendVerificationCode } from "@/lib/sms/verification";
import { enforceRateLimit, rateLimitKeyForIP } from "@/lib/rate-limiter";
import { withTelemetry } from "@/lib/telemetry";

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function phoneKey(phone: string) {
  return createHash("sha256").update(phone).digest("hex");
}

const post = async (request: NextRequest) => {
  try {
    const parsed = phoneSchema.safeParse((await request.json()).phone);
    if (!parsed.success) {
      return NextResponse.json({ error: "请输入有效的手机号" }, { status: 400 });
    }
    const phone = parsed.data;
    const limits = await Promise.all([
      enforceRateLimit(`password-reset-send:${rateLimitKeyForIP(requestIp(request))}`, 10, 60 * 60 * 1000),
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
