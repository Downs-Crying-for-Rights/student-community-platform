import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inviteRegisterSchema } from "@/lib/validators";
import {
  checkEmailUnique,
  checkPhoneUnique,
  createUserWithSession,
  validateNickname,
} from "@/lib/auth/register-helpers";
import { verifyCode } from "@/lib/sms/verification";
import { withTelemetry } from "@/lib/telemetry";

const post = async (request: NextRequest) => {
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

    const { inviteCode: inviteCodeValue, email, password, nickname, phone, code } = parsed.data;

    // 校验 nickname 非空
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json({ error: nicknameError.error }, { status: nicknameError.status });
    }

    // Find the invite code
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code: inviteCodeValue },
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

    const identityError = await checkEmailUnique(email) ?? await checkPhoneUnique(phone);
    if (identityError) {
      return NextResponse.json({ error: identityError.error }, { status: identityError.status });
    }

    if (!(await verifyCode(phone, code, "register"))) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    // 创建用户并在同一事务中标记邀请码已使用
    const result = await createUserWithSession({
      email,
      password,
      nickname,
      phone,
      extraData: {
        isAnonymous: false,
        dcrContributionAccess: inviteCode.dcrContributionAccess,
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

    return NextResponse.json(
      {
        success: true,
        message: "注册成功",
        userId: result.data.userId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Invite code registration error:", error);
    return NextResponse.json(
      { error: "服务器内部错误，请稍后重试" },
      { status: 500 }
    );
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/invite" });
