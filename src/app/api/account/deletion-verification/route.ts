import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { sendAccountDeletionEmailCode } from "@/lib/email-verification";
import { enforceRateLimit, rateLimitKeyForUser } from "@/lib/rate-limiter";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { sendVerificationCode } from "@/lib/sms/verification";

const schema = z.object({ method: z.enum(["email", "phone"]) }).strict();

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择验证码接收方式" }, { status: 400 });
  const limited = await enforceRateLimit(`account-deletion-code:${rateLimitKeyForUser(req.user.id)}`, 5, 60 * 60 * 1000);
  if (limited) return new NextResponse(limited.response.body, { status: limited.response.status, headers: limited.response.headers });

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, phone: true } });
  if (!user) return NextResponse.json({ error: "账号不存在" }, { status: 404 });

  if (parsed.data.method === "email") {
    if (!user.email) return NextResponse.json({ error: "账号未绑定邮箱" }, { status: 400 });
    const result = await sendAccountDeletionEmailCode(req.user.id);
    return result.success
      ? NextResponse.json({ sent: true, destination: maskEmail(user.email) })
      : NextResponse.json({ error: result.error }, { status: 503 });
  }

  if (!user.phone) return NextResponse.json({ error: "账号未绑定手机号" }, { status: 400 });
  const result = await sendVerificationCode(user.phone, "account-deletion");
  return result.success
    ? NextResponse.json({ sent: true, destination: maskPhone(user.phone) })
    : NextResponse.json({ error: result.error }, { status: 503 });
});
