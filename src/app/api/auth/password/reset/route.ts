import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";
import { enforceRateLimit, rateLimitKeyForIP } from "@/lib/rate-limiter";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { withTelemetry } from "@/lib/telemetry";

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

const post = async (request: NextRequest) => {
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { phone, code, password } = parsed.data;
    const phoneHash = createHash("sha256").update(phone).digest("hex");
    const limits = await Promise.all([
      enforceRateLimit(`password-reset:${rateLimitKeyForIP(requestIp(request))}`, 20, 60 * 60 * 1000),
      enforceRateLimit(`password-reset:phone:${phoneHash}`, 5, 15 * 60 * 1000),
    ]);
    if (limits.some(Boolean)) {
      return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
    }

    const validCode = await verifyCode(phone, code, "reset-password");
    if (!validCode) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, isBanned: true } });
    if (!user || user.isBanned) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, securityVersion: { increment: 1 } } });
      await logAudit(user.id, AuditAction.PASSWORD_RESET, AuditTargetType.USER, user.id, {
        method: "VERIFIED_PHONE",
      }, undefined, tx);
    });
    return NextResponse.json({ success: true, message: "密码已重置，请使用新密码登录" });
  } catch (error) {
    console.error("POST /api/auth/password/reset error:", error);
    return NextResponse.json({ error: "密码重置失败，请稍后再试" }, { status: 500 });
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/password/reset" });
