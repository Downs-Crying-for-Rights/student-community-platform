import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validators";
import {
  checkEmailUnique,
  checkPhoneUnique,
  createUserWithSession,
  validateNickname,
} from "@/lib/auth/register-helpers";
import { verifyCode } from "@/lib/sms/verification";
import { withTelemetry } from "@/lib/telemetry";
import { getSystemAccessPolicy } from "@/lib/system-config";
import { markRecentRegistration, verifyCaptcha } from "@/lib/captcha";

const post = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!await verifyCaptcha(body?.captchaId, body?.captchaCode, "register")) {
      return NextResponse.json({ error: "图形验证码错误或已过期" }, { status: 400 });
    }

    const { email, password, nickname, phone, code } = parsed.data;
    const { registration } = await getSystemAccessPolicy();
    if (!registration.emailEnabled) {
      return NextResponse.json({ error: "邮箱注册当前已关闭" }, { status: 403 });
    }
    if (registration.phoneRequired && (!phone || !code)) {
      return NextResponse.json({ error: "注册必须完成手机号验证", phoneVerificationRequired: true }, { status: 400 });
    }

    // 校验 nickname 非空
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      return NextResponse.json({ error: nicknameError.error }, { status: nicknameError.status });
    }

    const identityError = await checkEmailUnique(email) ?? (phone ? await checkPhoneUnique(phone) : null);
    if (identityError) {
      return NextResponse.json({ error: identityError.error }, { status: identityError.status });
    }

    if (phone && code && !(await verifyCode(phone, code, "register"))) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    const result = await createUserWithSession({
      email,
      password,
      nickname,
      phone,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await markRecentRegistration(result.data.userId).catch((error) => {
      console.error("Failed to mark recent registration", error);
    });

    return NextResponse.json(
      { success: true, message: "注册成功", userId: result.data.userId },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: "服务器错误，请稍后再试" },
      { status: 500 }
    );
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/register" });
