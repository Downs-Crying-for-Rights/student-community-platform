import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { setPasswordSchema } from "@/lib/validators";
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
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { password } = parsed.data;

    // 3. 检查用户是否已有密码
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 400 }
      );
    }

    if (user.passwordHash) {
      return NextResponse.json(
        { error: "已设置密码，不可重复设置" },
        { status: 400 }
      );
    }

    // 4. bcrypt 哈希密码（cost ≥ 10）
    const passwordHash = await bcrypt.hash(password, 10);

    // 5. 更新用户密码
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/password error:", error);
    return NextResponse.json(
      { error: "服务器错误，请稍后再试" },
      { status: 500 }
    );
  }
}
