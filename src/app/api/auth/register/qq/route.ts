import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { claimQQRegistrationRateLimit, createPendingQQRegistration } from "@/lib/qq-registration";
import { rateLimitKeyForIP } from "@/lib/rate-limiter";
import { qqRegistrationSchema } from "@/lib/validators";
import prisma from "@/lib/prisma";
import { LOGIN_POLICIES, REGISTRATION_POLICY_KEYS } from "@/lib/login-policies";
import { withTelemetry } from "@/lib/telemetry";
import { getSystemAccessPolicy } from "@/lib/system-config";
import { verifyCaptcha } from "@/lib/captcha";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const post = async (request: Request) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const parsed = qqRegistrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 }));
  }
  if (!await verifyCaptcha(parsed.data.captchaId, parsed.data.captchaCode, "register")) {
    return noStore(NextResponse.json({ error: "图形验证码错误或已过期" }, { status: 400 }));
  }

  const usernameKey = createHash("sha256").update(parsed.data.username).digest("hex");
  const allowed = await claimQQRegistrationRateLimit("issue", rateLimitKeyForIP(ip), usernameKey, 5, 3);
  if (!allowed) return noStore(NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 }));

  try {
    const { registration } = await getSystemAccessPolicy();
    if (!registration.qqEnabled) {
      return noStore(NextResponse.json({ error: "QQ 机器人注册当前已关闭" }, { status: 403 }));
    }
    if (registration.phoneRequired) {
      return noStore(NextResponse.json({ error: "当前注册必须验证手机号，请使用邮箱注册" }, { status: 403 }));
    }
    await Promise.all(REGISTRATION_POLICY_KEYS.map((key) => prisma.siteContent.upsert({
      where: { key },
      update: {},
      create: { key, title: LOGIN_POLICIES[key].title, content: LOGIN_POLICIES[key].content },
    })));
    const required = await prisma.siteContent.findMany({
      where: { key: { in: [...REGISTRATION_POLICY_KEYS] } },
      select: { key: true, revision: true },
    });
    const accepted = parsed.data.agreementRevisions;
    if (required.length !== REGISTRATION_POLICY_KEYS.length || required.some((item) => accepted[item.key] !== item.revision) || Object.keys(accepted).length !== required.length) {
      return noStore(NextResponse.json({ error: "注册协议已更新，请刷新页面后重新确认" }, { status: 409 }));
    }
    const result = await createPendingQQRegistration(parsed.data.username, parsed.data.password, accepted);
    if (!result.ok) {
      const message = result.reason === "USERNAME_TAKEN" ? "用户名已被占用" : "该用户名已有待确认注册，请稍后重试";
      return noStore(NextResponse.json({ error: message }, { status: 409 }));
    }
    return noStore(NextResponse.json({
      credential: result.credential,
      command: `注册 ${result.credential}`,
      expiresAt: result.expiresAt.toISOString(),
    }, { status: 201 }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return noStore(NextResponse.json({ error: "用户名已被占用或已有待确认注册" }, { status: 409 }));
    }
    return noStore(NextResponse.json({ error: "注册凭据生成失败，请稍后重试" }, { status: 500 }));
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/register/qq" });
