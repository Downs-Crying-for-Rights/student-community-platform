import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loginPasswordSchema } from "@/lib/validators";
import { createPunishmentChallenge } from "@/lib/punishment-challenge";
import { getCurrentPunishmentStatus } from "@/lib/punishment-service";
import { enforceRateLimit, rateLimitKeyForIP } from "@/lib/rate-limiter";
import { asNextResponse } from "@/lib/support-ticket";
import { withTelemetry } from "@/lib/telemetry";
import { issueCaptchaProof, validateCaptchaProof } from "@/lib/captcha";

export const POST = withTelemetry(async (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const limited = await enforceRateLimit(`punishment-check:${rateLimitKeyForIP(forwarded || "unknown")}`, 10, 15 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);
  const body = await req.json().catch(() => null);
  if (!await validateCaptchaProof(body?.captchaProof, "login-password")) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
  const parsed = loginPasswordSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ valid: false }, { status: 401 });
  const identifier = parsed.data.identifier;
  const normalized = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, ...(normalized === identifier ? [] : [{ email: normalized }]), { username: normalized }, { phone: identifier }] },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash || !await bcrypt.compare(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
  const status = await getCurrentPunishmentStatus(user.id);
  if (!status?.isBanned) {
    return NextResponse.json({
      valid: true,
      banned: false,
      captchaProof: await issueCaptchaProof("login-password"),
    });
  }
  const punishment = await prisma.userPunishment.findFirst({
    where: { userId: user.id, action: "APPLIED", revokedAt: null, type: { in: ["TEMPORARY_BAN", "PERMANENT_BAN", "ACCOUNT_BAN"] }, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { reason: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  const response = NextResponse.json({ valid: true, banned: true, reason: punishment?.reason ?? "账号因违反平台规则被封禁", expiresAt: status.banUntil });
  response.cookies.set("punishment_appeal", createPunishmentChallenge(user.id), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/punishments/ban-appeal", maxAge: 600 });
  return response;
}, { route: "/api/auth/punishment-check" });
