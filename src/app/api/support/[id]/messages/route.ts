import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { asNextResponse, noStoreJson, readRequiredText } from "@/lib/support-ticket";
import { containsBlockedSupportWord } from "@/lib/support-ticket-server";

export const POST = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const limited = await enforceRateLimit(`support:reply:${req.user.id}`, 20, 10 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);

  const body = await req.json().catch(() => null);
  const content = readRequiredText(body?.content, 5000);
  if (!content) return noStoreJson({ error: "回复不能为空，且不得超过 5000 字" }, { status: 400 });
  if (await containsBlockedSupportWord(content)) {
    return noStoreJson({ error: "内容包含不允许提交的词语，请修改后重试" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, requesterId: req.user.id },
    select: { id: true, status: true, kind: true },
  });
  if (!ticket) return noStoreJson({ error: "工单不存在" }, { status: 404 });
  if (ticket.status === "CLOSED") return noStoreJson({ error: "已关闭的工单不能回复" }, { status: 409 });
  if (ticket.kind === "PUNISHMENT_APPEAL" && ticket.status === "RESOLVED") {
    return noStoreJson({ error: "已处理的处罚申诉不能继续回复" }, { status: 409 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicketMessage.create({
      data: { ticketId: ticket.id, content, authorType: "USER", authorId: req.user.id },
    });
    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: ticket.status === "WAITING_FOR_USER" || ticket.status === "RESOLVED"
        ? { status: "IN_PROGRESS", resolvedAt: null }
        : { updatedAt: new Date() },
    });
    return created;
  });
  return noStoreJson({ message }, { status: 201 });
});
