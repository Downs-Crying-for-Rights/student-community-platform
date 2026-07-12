import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inviteRegisterSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";
import { createUserWithSession, validateNickname } from "@/lib/auth/register-helpers";

export async function POST(request: NextRequest) {
  try {
    // 速率限制：5 次/分钟/IP（防注册轰炸）
    try {
      const { enforceRateLimit } = await import("@/lib/rate-limiter");
      const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
        .split(",")[0].trim();
      const limit = await enforceRateLimit(`register:invite:${ip}`, 5, 60 * 1000);
      if (!limit?.allowed) {
        return NextResponse.json(
          { error: "注册请求过于频繁，请稍后再试" },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      }
    } catch { /* rate limiter 不可用，降级放行 */ }

    const body = await request.json();

    // Validate request body
    const parsed = inviteRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败" },
        { status: 400 }
      );
    }

    const { inviteCode: code, email, password, phone, nickname, code: smsCode } = parsed.data;

    // 校验 nickname 非空
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json({ error: nicknameError.error }, { status: nicknameError.status });
    }

    // Find the invite code
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code },
    });

    if (!inviteCode) {
      return NextResponse.json(
        { error: "邀请码无效" },
        { status: 400 }
      );
    }

    // Check if already used
    if (inviteCode.isUsed) {
      return NextResponse.json(
        { error: "邀请码已被使用" },
        { status: 400 }
      );
    }

    // Check if revoked
    if (inviteCode.isRevoked) {
      return NextResponse.json(
        { error: "邀请码已被撤销" },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date() > inviteCode.expiresAt) {
      return NextResponse.json(
        { error: "邀请码已过期" },
        { status: 400 }
      );
    }

    // 验证短信验证码
    const isValid = await verifyCode(phone, smsCode, "login");
    if (!isValid) {
      return NextResponse.json(
        { error: "验证码错误或已过期" },
        { status: 400 }
      );
    }

    // 创建用户并生成 session（含邮箱/手机号唯一性检查），在同一事务中标记邀请码已使用
    const result = await createUserWithSession({
      email,
      password,
      phone,
      nickname,
      extraData: {
        isAnonymous: false,
        dcrAccess: true,
        dcrPledgeSigned: true,
      },
      afterCreate: async (tx, userId) => {
        await tx.inviteCode.update({
          where: { id: inviteCode.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
            usedById: userId,
          },
        });
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "注册成功",
        userId: result.data.userId,
      },
      { status: 201 }
    );

    // Set the session cookie so NextAuth recognizes the session
    response.cookies.set("next-auth.session-token", result.data.sessionToken, {
      expires: result.data.expires,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Invite code registration error:", error);
    return NextResponse.json(
      { error: "服务器内部错误，请稍后重试" },
      { status: 500 }
    );
  }
}
