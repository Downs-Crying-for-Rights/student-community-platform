import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { isAdminRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  asNextResponse,
  isSupportStatus,
  noStoreJson,
  readRequiredText,
  SUPPORT_STATUS_LABELS,
  supportMessageSelect,
  supportTicketSelect,
} from "@/lib/support-ticket";
import { containsBlockedSupportWord } from "@/lib/support-ticket-server";
import { revokePunishment } from "@/lib/punishment-service";
import { runSerializableTransaction } from "@/lib/serializable-transaction";

export const GET = withAuth(async (_req: AuthenticatedRequest, { params }) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id },
    select: {
      ...supportTicketSelect,
      requester: { select: { id: true, nickname: true } },
      messages: { select: supportMessageSelect, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return noStoreJson({ error: "工单不存在" }, { status: 404 });
  return noStoreJson({ ticket });
}, "ADMIN");

export const POST = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const limited = await enforceRateLimit(`admin:support:reply:${req.user.id}`, 60, 10 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);
  const body = await req.json().catch(() => null);
  const content = readRequiredText(body?.content, 5000);
  if (!content) return noStoreJson({ error: "回复不能为空，且不得超过 5000 字" }, { status: 400 });
  if (await containsBlockedSupportWord(content)) {
    return noStoreJson({ error: "内容包含不允许提交的词语，请修改后重试" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id },
    select: { id: true, requesterId: true, status: true, kind: true },
  });
  if (!ticket) return noStoreJson({ error: "工单不存在" }, { status: 404 });
  if (ticket.status === "CLOSED") return noStoreJson({ error: "已关闭的工单不能回复" }, { status: 409 });
  if (ticket.kind === "PUNISHMENT_APPEAL" && ticket.status === "RESOLVED") {
    return noStoreJson({ error: "已处理的处罚申诉不能继续回复" }, { status: 409 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const claimed = await tx.supportTicket.updateMany({
      where: {
        id: ticket.id,
        status: ticket.kind === "PUNISHMENT_APPEAL"
          ? { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] }
          : { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED"] },
      },
      data: { status: "WAITING_FOR_USER", resolvedAt: null },
    });
    if (claimed.count !== 1) throw new Error("SUPPORT_TICKET_NOT_REPLYABLE");
    const created = await tx.supportTicketMessage.create({
      data: { ticketId: ticket.id, content, authorType: "STAFF", authorId: req.user.id },
    });
    return created;
  }).catch((error) => {
    if (error instanceof Error && error.message === "SUPPORT_TICKET_NOT_REPLYABLE") return null;
    throw error;
  });
  if (!message) return noStoreJson({ error: "工单已关闭或处理，不能回复" }, { status: 409 });
  await logAudit(req.user.id, "SUPPORT_REPLY", "SUPPORT_TICKET", ticket.id, { status: "WAITING_FOR_USER" });
  await createNotification(ticket.requesterId, "SYSTEM", "客服工单有新回复", "工作人员已回复你的客服工单，请前往查看。", `/support/${ticket.id}`);
  return noStoreJson({ message }, { status: 201 });
}, "ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const limited = await enforceRateLimit(`admin:support:update:${req.user.id}`, 60, 10 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);
  const body = await req.json().catch(() => null);
  const hasStatus = body && Object.prototype.hasOwnProperty.call(body, "status");
  const hasAssignee = body && Object.prototype.hasOwnProperty.call(body, "assignedToId");
  const hasAppealDecision = body && Object.prototype.hasOwnProperty.call(body, "appealDecision");
  if (!hasStatus && !hasAssignee && !hasAppealDecision) return noStoreJson({ error: "没有可更新的字段" }, { status: 400 });
  if (hasStatus && !isSupportStatus(body.status)) return noStoreJson({ error: "状态无效" }, { status: 400 });
  if (hasAssignee && body.assignedToId !== null && typeof body.assignedToId !== "string") {
    return noStoreJson({ error: "处理人无效" }, { status: 400 });
  }
  if (hasAppealDecision && !["ACCEPT", "REJECT"].includes(body.appealDecision)) {
    return noStoreJson({ error: "申诉处理决定无效" }, { status: 400 });
  }
  const reviewNote = hasAppealDecision ? readRequiredText(body.reviewNote, 500) : null;
  if (hasAppealDecision && !reviewNote) return noStoreJson({ error: "请填写申诉处理说明" }, { status: 400 });
  if (hasAssignee && body.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assignedToId }, select: { role: true } });
    if (!assignee || !isAdminRole(assignee.role)) return noStoreJson({ error: "处理人必须是管理员" }, { status: 400 });
  }

  const existing = await prisma.supportTicket.findFirst({
    where: { id: params.id },
    select: { id: true, requesterId: true, status: true, assignedToId: true, kind: true, punishmentId: true },
  });
  if (!existing) return noStoreJson({ error: "工单不存在" }, { status: 404 });
  if (hasAppealDecision) {
    if (existing.kind !== "PUNISHMENT_APPEAL" || !existing.punishmentId) return noStoreJson({ error: "该工单不是处罚申诉" }, { status: 409 });
    if (["RESOLVED", "CLOSED"].includes(existing.status)) return noStoreJson({ error: "该处罚申诉已处理" }, { status: 409 });
    const ticket = await runSerializableTransaction(async (tx) => {
      const claimed = await tx.supportTicket.updateMany({
        where: { id: existing.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER"] } },
        data: { status: "RESOLVED", resolvedAt: new Date(), assignedToId: req.user.id },
      });
      if (claimed.count !== 1) throw new Error("APPEAL_ALREADY_DECIDED");
      if (body.appealDecision === "ACCEPT") {
        await revokePunishment({ punishmentId: existing.punishmentId!, operatorId: req.user.id, reason: reviewNote! }, tx);
      }
      await tx.supportTicketMessage.create({
        data: { ticketId: existing.id, content: reviewNote!, authorType: "SYSTEM", authorId: req.user.id },
      });
      return tx.supportTicket.findUniqueOrThrow({ where: { id: existing.id }, select: supportTicketSelect });
    }).catch((error) => {
      if (error instanceof Error && error.message === "APPEAL_ALREADY_DECIDED") return null;
      throw error;
    });
    if (!ticket) return noStoreJson({ error: "该处罚申诉已处理" }, { status: 409 });
    await logAudit(req.user.id, "PUNISHMENT_APPEAL_DECIDE", "SUPPORT_TICKET", existing.id, {
      punishmentId: existing.punishmentId, decision: body.appealDecision,
    });
    await createNotification(existing.requesterId, "SYSTEM", body.appealDecision === "ACCEPT" ? "处罚申诉已通过" : "处罚申诉复核完成", reviewNote!, `/support/${existing.id}`);
    return noStoreJson({ ticket });
  }
  const now = new Date();
  const status = hasStatus ? body.status : existing.status;
  const ticket = await prisma.supportTicket.update({
    where: { id: existing.id },
    data: {
      ...(hasStatus ? {
        status,
        resolvedAt: status === "RESOLVED" ? now : null,
        closedAt: status === "CLOSED" ? now : null,
      } : {}),
      ...(hasAssignee ? { assignedToId: body.assignedToId } : {}),
    },
    select: supportTicketSelect,
  });
  await logAudit(req.user.id, "SUPPORT_UPDATE", "SUPPORT_TICKET", existing.id, {
    oldStatus: existing.status,
    newStatus: ticket.status,
    oldAssigneeId: existing.assignedToId,
    newAssigneeId: ticket.assignedTo?.id ?? null,
  });
  if (hasStatus && ticket.status !== existing.status) {
    await createNotification(existing.requesterId, "SYSTEM", "客服工单状态已更新", `你的客服工单状态已更新为“${SUPPORT_STATUS_LABELS[ticket.status]}”。`, `/support/${existing.id}`);
  }
  return noStoreJson({ ticket });
}, "ADMIN");
