import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { canAppealPunishment } from "@/lib/punishment-service";
import { asNextResponse, noStoreJson, readRequiredText, supportTicketSelect } from "@/lib/support-ticket";
import { containsBlockedSupportWord } from "@/lib/support-ticket-server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const POST = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const limited = await enforceRateLimit(`punishment:appeal:${req.user.id}`, 3, 24 * 60 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);
  const content = readRequiredText((await req.json().catch(() => null))?.content, 5000);
  if (!content) return noStoreJson({ error: "申诉说明不能为空，且不得超过 5000 字" }, { status: 400 });
  if (await containsBlockedSupportWord(content)) return noStoreJson({ error: "内容包含不允许提交的词语" }, { status: 400 });
  const punishment = await prisma.userPunishment.findFirst({ where: { id: params.id, userId: req.user.id } });
  if (!punishment || !canAppealPunishment(punishment)) return noStoreJson({ error: "该处罚当前不可申诉" }, { status: 409 });
  const existing = await prisma.supportTicket.findFirst({ where: { punishmentId: punishment.id, kind: "PUNISHMENT_APPEAL", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] } }, select: { id: true } });
  if (existing) return noStoreJson({ error: "该处罚已有处理中申诉", ticketId: existing.id }, { status: 409 });
  const ticket = await prisma.supportTicket.create({ data: { kind: "PUNISHMENT_APPEAL", subject: "处罚申诉", requesterId: req.user.id, punishmentId: punishment.id, messages: { create: { content, authorType: "USER", authorId: req.user.id } } }, select: supportTicketSelect });
  await logAudit(req.user.id, "PUNISHMENT_APPEAL_CREATE", "SUPPORT_TICKET", ticket.id, { punishmentId: punishment.id });
  return noStoreJson({ ticket }, { status: 201 });
});
