import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { nicknameSchema } from "@/lib/validators";
import { withTelemetry } from "@/lib/telemetry";
import { findAccountNameConflict } from "@/lib/auth/account-name";

/**
 * POST /api/auth/username
 * Set the nickname for the current user. Requires auth.
 */
const post = async (req: Request) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = nicknameSchema.safeParse(body.nickname);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "昵称格式无效" },
        { status: 400 },
      );
    }

    const nickname = parsed.data;

    // 检查昵称是否已被其他用户使用
    const existing = await findAccountNameConflict(prisma, nickname, session.user.id);
    if (existing) {
      return NextResponse.json({ error: "该用户名已被使用" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { nickname },
    });

    return NextResponse.json({ success: true, nickname });
  } catch (error) {
    console.error("POST /api/auth/username error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/username" });
