import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPunishmentChallenge } from "@/lib/punishment-challenge";
import { canAppealPunishment } from "@/lib/punishment-service";
import { noStoreJson, readRequiredText } from "@/lib/support-ticket";
import { containsBlockedSupportWord } from "@/lib/support-ticket-server";
import { logAudit } from "@/lib/audit";
import { enforceRateLimit, rateLimitKeyForIP, requestIP } from "@/lib/rate-limiter";
import { withTelemetry } from "@/lib/telemetry";
import { PUNISHMENT_TYPE_LABELS } from "@/lib/punishment-policy";

async function getAppealContext(userId: string) {
  const punishment = await prisma.userPunishment.findFirst({
    where: { userId, action: "APPLIED", revokedAt: null, type: { in: ["TEMPORARY_BAN", "PERMANENT_BAN", "ACCOUNT_BAN"] }, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });
  if (!punishment || !canAppealPunishment(punishment)) return null;
  const existingAppeal = await prisma.supportTicket.findFirst({
    where: { punishmentId: punishment.id, kind: "PUNISHMENT_APPEAL", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] } },
    select: { id: true, status: true },
  });
  return { punishment, existingAppeal };
}

export const GET = withTelemetry(async (req: NextRequest) => {
  const userId = verifyPunishmentChallenge(req.cookies.get("punishment_appeal")?.value);
  if (!userId) return noStoreJson({ error: "申诉凭证已失效，请重新验证账号密码" }, { status: 401 });
  const context = await getAppealContext(userId);
  if (!context) return noStoreJson({ error: "当前没有可申诉的封禁" }, { status: 409 });
  return noStoreJson({
    punishment: {
      typeLabel: PUNISHMENT_TYPE_LABELS[context.punishment.type],
      reason: context.punishment.reason,
      startsAt: context.punishment.startsAt,
      expiresAt: context.punishment.expiresAt,
    },
    existingAppeal: context.existingAppeal,
  });
}, { route: "/api/punishments/ban-appeal" });

export const POST = withTelemetry(async (req: NextRequest) => {
  const limited = await enforceRateLimit(`ban-appeal:${rateLimitKeyForIP(requestIP(req))}`, 5, 60 * 60 * 1000);
  if (limited) return new Response(limited.response.body, { status: limited.response.status, headers: limited.response.headers });
  const userId = verifyPunishmentChallenge(req.cookies.get("punishment_appeal")?.value);
  if (!userId) return noStoreJson({ error: "申诉凭证已失效，请重新验证账号密码" }, { status: 401 });
  const content = readRequiredText((await req.json().catch(() => null))?.content, 5000);
  if (!content || await containsBlockedSupportWord(content)) return noStoreJson({ error: "申诉说明无效" }, { status: 400 });
  const context = await getAppealContext(userId);
  if (!context) return noStoreJson({ error: "当前没有可申诉的封禁" }, { status: 409 });
  if (context.existingAppeal) return noStoreJson({ submitted: true });
  const ticket = await prisma.supportTicket.create({ data: { kind: "PUNISHMENT_APPEAL", subject: "封禁申诉", requesterId: userId, punishmentId: context.punishment.id, messages: { create: { content, authorType: "USER", authorId: userId } } } });
  await logAudit(userId, "PUNISHMENT_APPEAL_CREATE", "SUPPORT_TICKET", ticket.id, { punishmentId: context.punishment.id });
  const response = noStoreJson({ submitted: true }, { status: 201 });
  response.cookies.delete("punishment_appeal");
  return response;
}, { route: "/api/punishments/ban-appeal" });
