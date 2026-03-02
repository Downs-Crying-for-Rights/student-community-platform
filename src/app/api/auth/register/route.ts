import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { verifyCode } from "@/lib/sms/verification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, phone, code } = parsed.data;

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
    const isValid = await verifyCode(phone, code, "login");
    if (!isValid) {
      return NextResponse.json(
        { error: "验证码错误或已过期" },
        { status: 400 }
      );
    }

    // 创建用户
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        phone,
      },
    });

    // 创建 session 以便自动登录
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const response = NextResponse.json(
      { success: true, message: "注册成功" },
      { status: 201 }
    );

    response.cookies.set("next-auth.session-token", sessionToken, {
      expires,
      httpOnly: true,
      sameSite: "lax",
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
