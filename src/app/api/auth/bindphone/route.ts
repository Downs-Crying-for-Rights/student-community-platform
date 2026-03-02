import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { bindPhoneSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // 1. 验证已登录状态
    const token = await getToken({ req: request });
    if (!token?.id) {
      return NextResponse.json(
        { error: "未登录，请先登录" },
        { status: 401 }
      );
    }

    const userId = token.id as string;

    // 2. 解析并验证请求体
    const body = await request.json();
    const parsed = bindPhoneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { phone, code } = parsed.data;

    // 3. 验证短信验证码
    const isValid = await verifyCode(phone, code, "bindphone");
    if (!isValid) {
      return NextResponse.json(
        { error: "验证码错误或已过期" },
        { status: 400 }
      );
    }

    // 4. 检查手机号唯一性
    const existingUser = await prisma.user.findFirst({
      where: { phone },
    });

    if (existingUser && existingUser.id !== userId) {
      return NextResponse.json(
        { error: "该手机号已被其他账户绑定" },
        { status: 409 }
      );
    }

    // 5. 更新用户手机号
    await prisma.user.update({
      where: { id: userId },
      data: { phone },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/bindphone error:", error);
    return NextResponse.json(
      { error: "服务器错误，请稍后再试" },
      { status: 500 }
    );
  }
}
