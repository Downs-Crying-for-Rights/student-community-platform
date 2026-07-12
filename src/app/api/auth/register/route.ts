import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";
import { createUserWithSession, validateNickname } from "@/lib/auth/register-helpers";

export async function POST(request: NextRequest) {
  try {
    // 速率限制：5 次/分钟/IP（防注册轰炸）
    try {
      const { enforceRateLimit } = await import("@/lib/rate-limiter");
      const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
        .split(",")[0].trim();
      const limitResult = await enforceRateLimit(`register:${ip}`, 5, 60 * 1000);
      if (!limitResult?.result.allowed) {
        return NextResponse.json(
          { error: "注册请求过于频繁，请稍后再试" },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      }
    } catch { /* rate limiter 不可用，降级放行 */ }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, phone, code, nickname } = parsed.data;

    // 校验 nickname 非空
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json({ error: nicknameError.error }, { status: nicknameError.status });
    }

    // 验证短信验证码
    const isValid = await verifyCode(phone, code, "login");
    if (!isValid) {
      return NextResponse.json(
        { error: "验证码错误或已过期" },
        { status: 400 }
      );
    }

    // 创建用户并生成 session（含邮箱/手机号唯一性检查）
    const result = await createUserWithSession({
      email,
      password,
      phone,
      nickname,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json(
      { success: true, message: "注册成功" },
      { status: 201 }
    );

    response.cookies.set("next-auth.session-token", result.data.sessionToken, {
      expires: result.data.expires,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: "服务器错误，请稍后再试" },
      { status: 500 }
    );
  }
}
