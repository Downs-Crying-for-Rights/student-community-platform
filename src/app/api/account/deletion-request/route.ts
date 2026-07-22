import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { ACCOUNT_DELETION_NOTICE_KEY, getAccountDeletionNotice } from "@/lib/account-deletion-notice";
import { verifyAccountDeletionEmailCode } from "@/lib/email-verification";
import { enforceRateLimit, rateLimitKeyForUser } from "@/lib/rate-limiter";
import { verifyCode } from "@/lib/sms/verification";
import { verificationCodeSchema } from "@/lib/validators";

const requestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  method: z.enum(["email", "phone"]),
  code: verificationCodeSchema,
  noticeAccepted: z.literal(true),
  noticeRevision: z.number().int().positive(),
}).strict();

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { userId: req.user.id },
    select: { id: true, status: true, reason: true, reviewNote: true, requestedAt: true, reviewedAt: true },
  });
  return NextResponse.json({ request });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  const limited = await enforceRateLimit(`account-deletion-verify:${rateLimitKeyForUser(req.user.id)}`, 10, 60 * 60 * 1000);
  if (limited) return new NextResponse(limited.response.body, { status: limited.response.status, headers: limited.response.headers });
  const [user, notice] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, phone: true } }),
    getAccountDeletionNotice(),
  ]);
  if (!user) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  if (notice.revision !== parsed.data.noticeRevision) {
    return NextResponse.json({ error: "注销须知已更新，请重新阅读并确认" }, { status: 409 });
  }
  const verified = parsed.data.method === "email"
    ? Boolean(user.email) && await verifyAccountDeletionEmailCode(req.user.id, parsed.data.code)
    : Boolean(user.phone) && await verifyCode(user.phone!, parsed.data.code, "account-deletion");
  if (!verified) return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });

  const request = await prisma.$transaction(async (tx) => {
    const existing = await tx.accountDeletionRequest.findUnique({ where: { userId: req.user.id } });
    if (existing?.status === "PENDING") throw new Error("ALREADY_PENDING");
    const updated = await tx.accountDeletionRequest.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, reason: parsed.data.reason || null },
      update: {
        status: "PENDING", reason: parsed.data.reason || null, reviewNote: null,
        reviewerId: null, reviewedAt: null, completedAt: null, requestedAt: new Date(),
      },
      select: { id: true, status: true, requestedAt: true },
    });
    await logAudit(req.user.id, "ACCOUNT_DELETION_REQUEST", "ACCOUNT_DELETION_REQUEST", updated.id, {
      verificationMethod: parsed.data.method.toUpperCase(),
      noticeKey: ACCOUNT_DELETION_NOTICE_KEY,
      noticeRevision: notice.revision,
      noticeAcceptedAt: new Date().toISOString(),
    }, undefined, tx);
    return updated;
  }).catch((error) => {
    if (error instanceof Error && error.message === "ALREADY_PENDING") return null;
    throw error;
  });
  if (!request) return NextResponse.json({ error: "注销申请正在等待审核" }, { status: 409 });

  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isBanned: false },
    select: { id: true },
  }).catch(() => []);
  await Promise.allSettled(admins.map((admin) => createNotification(
    admin.id,
    "SYSTEM",
    "新的账号注销申请",
    "有用户提交了账号注销申请，请及时审核。",
    "/admin/account-deletions",
  )));
  return NextResponse.json({ request }, { status: 201 });
});

export const DELETE = withAuth(async (req: AuthenticatedRequest) => {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.accountDeletionRequest.updateMany({
      where: { userId: req.user.id, status: "PENDING" },
      data: { status: "CANCELLED", reviewedAt: new Date() },
    });
    if (updated.count !== 1) return false;
    const request = await tx.accountDeletionRequest.findUniqueOrThrow({ where: { userId: req.user.id }, select: { id: true } });
    await logAudit(req.user.id, "ACCOUNT_DELETION_CANCEL", "ACCOUNT_DELETION_REQUEST", request.id, undefined, undefined, tx);
    return true;
  });
  return result
    ? NextResponse.json({ status: "CANCELLED" })
    : NextResponse.json({ error: "没有可撤回的注销申请" }, { status: 409 });
});
