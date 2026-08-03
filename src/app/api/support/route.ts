import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  asNextResponse,
  noStoreJson,
  readRequiredText,
  supportTicketSelect,
} from "@/lib/support-ticket";
import { containsBlockedSupportWord } from "@/lib/support-ticket-server";
import { hasAcceptedSupportTicketAttestation } from "@/lib/support-ticket-policy";

const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { requesterId: req.user.id },
    select: supportTicketSelect,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return noStoreJson({ tickets });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const limited = await enforceRateLimit(`support:create:${req.user.id}`, CREATE_LIMIT, CREATE_WINDOW_MS);
  if (limited) return asNextResponse(limited.response);

  const body = await req.json().catch(() => null);
  const subject = readRequiredText(body?.subject, 120);
  const content = readRequiredText(body?.content, 5000);
  if (!subject || !content) {
    return noStoreJson({ error: "主题和问题描述不能为空，且不得超过长度限制" }, { status: 400 });
  }
  if (!hasAcceptedSupportTicketAttestation(body?.informationAttested)) {
    return noStoreJson({ error: "请先勾选并确认工单信息声明" }, { status: 400 });
  }
  if (await containsBlockedSupportWord(`${subject}\n${content}`)) {
    return noStoreJson({ error: "内容包含不允许提交的词语，请修改后重试" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      kind: "GENERAL",
      subject,
      requesterId: req.user.id,
      messages: { create: { content, authorType: "USER", authorId: req.user.id } },
    },
    select: supportTicketSelect,
  });
  return noStoreJson({ ticket }, { status: 201 });
});
