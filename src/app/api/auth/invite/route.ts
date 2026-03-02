import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { inviteRegisterSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = inviteRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败" },
        { status: 400 }
      );
    }

    const { inviteCode: code, email, password, phone, code: smsCode } = parsed.data;

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

    // 检查邮箱是否已注册
    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: "该邮箱已被注册" },
        { status: 409 }
      );
    }

    // 检查手机号是否已绑定
    const existingPhone = await prisma.user.findFirst({
      where: { phone },
      select: { id: true },
    });
    if (existingPhone) {
      return NextResponse.json(
        { error: "该手机号已被其他账户绑定" },
        { status: 409 }
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

    // Hash password before transaction
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user with full identity and mark invite code as used in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user with full identity
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          phone,
          isAnonymous: false,
          dcrAccess: true,
        },
      });

      // Mark invite code as used
      await tx.inviteCode.update({
        where: { id: inviteCode.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
          usedById: user.id,
        },
      });

      // Create a session for the new user
      const sessionToken = crypto.randomUUID();
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await tx.session.create({
        data: {
          sessionToken,
          userId: user.id,
          expires,
        },
      });

      return { user, sessionToken, expires };
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "注册成功",
        userId: result.user.id,
      },
      { status: 201 }
    );

    // Set the session cookie so NextAuth recognizes the session
    response.cookies.set("next-auth.session-token", result.sessionToken, {
      expires: result.expires,
      httpOnly: true,
      sameSite: "lax",
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
