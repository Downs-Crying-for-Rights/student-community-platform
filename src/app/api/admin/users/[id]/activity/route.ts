import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { z } from "zod";
import { decryptQQAuditValue, redactSensitiveQQText } from "@/lib/qq-message-audit";

const domains = [
  "posts", "revisions", "comments", "likes", "bookmarks", "reports-filed", "reports-received",
  "punishments", "notifications", "dm-threads", "dm-messages", "chat-memberships", "chat-messages",
  "chat-requests", "chat-bans", "case-messages", "help-sessions", "help-messages", "dcr-cases",
  "dcr-applications", "dcr-tasks", "dcr-claims", "dcr-evidence", "dcr-timeline", "dcr-cycles",
  "psychology", "dcr-private", "identity", "auth-providers", "auth-sessions", "invites", "announcements", "qq", "qq-private", "audit", "diagnostics", "ai",
] as const;

type Domain = (typeof domains)[number];
const privateDomains = new Set<Domain>(["dm-messages", "chat-messages", "case-messages", "help-messages", "psychology", "dcr-private", "qq-private"]);
const diagnosticDomains = new Set<Domain>(["audit", "diagnostics", "ai"]);

const querySchema = paginationSchema.extend({ domain: z.enum(domains) });
const pageOf = <T>(items: T[], total: number, page: number, pageSize: number) => ({
  items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
});

async function pageSections(
  sections: Array<{ group: string; total: number; load: (skip: number, take: number) => Promise<unknown[]> }>,
  page: number,
  pageSize: number,
) {
  let offset = (page - 1) * pageSize;
  let remaining = pageSize;
  const items: Array<{ group: string; items: unknown[] }> = [];
  for (const section of sections) {
    if (remaining <= 0) break;
    if (offset >= section.total) {
      offset -= section.total;
      continue;
    }
    const take = Math.min(remaining, section.total - offset);
    const sectionItems = await section.load(offset, take);
    if (sectionItems.length) items.push({ group: section.group, items: sectionItems });
    remaining -= sectionItems.length;
    offset = 0;
  }
  return { items, total: sections.reduce((sum, section) => sum + section.total, 0) };
}

function encrypted(row: Record<string, unknown>, prefix: "input" | "reply") {
  const ciphertext = row[`${prefix}Ciphertext`];
  const iv = row[`${prefix}Iv`];
  const authTag = row[`${prefix}AuthTag`];
  const keyVersion = row[`${prefix}KeyVersion`];
  return typeof ciphertext === "string" && typeof iv === "string" && typeof authTag === "string" && typeof keyVersion === "number"
    ? { ciphertext, iv, authTag, keyVersion }
    : null;
}

function sanitizeQQContent(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveQQText(value);
  if (Array.isArray(value)) return value.map(sanitizeQQContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeQQContent(item)]));
  }
  return value;
}

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
    }

    const { domain, page, pageSize } = parsed.data;
    const requiresSuperAdmin = privateDomains.has(domain) || diagnosticDomains.has(domain);
    if (requiresSuperAdmin && req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "该数据仅超级管理员可查看" }, { status: 403 });
    }
    if (!await prisma.user.findUnique({ where: { id }, select: { id: true } })) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const skip = (page - 1) * pageSize;
    const paging = { skip, take: pageSize };
    let items: unknown[];
    let total: number;

    switch (domain) {
      case "posts":
        [items, total] = await Promise.all([
          prisma.post.findMany({ where: { authorId: id }, select: { id: true, title: true, content: true, summary: true, status: true, visibility: true, isAnonymous: true, dcrCategory: true, likeCount: true, commentCount: true, isPinned: true, board: { select: { id: true, name: true, zone: true } }, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.post.count({ where: { authorId: id } }),
        ]); break;
      case "revisions":
        [items, total] = await Promise.all([
          prisma.postRevision.findMany({ where: { OR: [{ editorId: id }, { reviewerId: id }] }, select: { id: true, postId: true, editorId: true, reviewerId: true, title: true, content: true, summary: true, visibility: true, status: true, rejectionReason: true, baseUpdatedAt: true, createdAt: true, reviewedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.postRevision.count({ where: { OR: [{ editorId: id }, { reviewerId: id }] } }),
        ]); break;
      case "comments":
        [items, total] = await Promise.all([
          prisma.comment.findMany({ where: { authorId: id }, select: { id: true, postId: true, parentId: true, content: true, isDeleted: true, isAnonymous: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.comment.count({ where: { authorId: id } }),
        ]); break;
      case "likes":
        [items, total] = await Promise.all([
          prisma.like.findMany({ where: { userId: id }, select: { postId: true, createdAt: true, post: { select: { title: true, status: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.like.count({ where: { userId: id } }),
        ]); break;
      case "bookmarks":
        [items, total] = await Promise.all([
          prisma.bookmark.findMany({ where: { userId: id }, select: { postId: true, createdAt: true, post: { select: { title: true, status: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.bookmark.count({ where: { userId: id } }),
        ]); break;
      case "reports-filed":
      case "reports-received": {
        const where = domain === "reports-filed" ? { reporterId: id } : {
          OR: [
            { targetUserId: id }, { targetPost: { authorId: id } }, { targetComment: { authorId: id } },
            { targetTask: { requesterId: id } }, { targetCaseMessage: { senderId: id } },
            { targetHelpMessage: { senderId: id } }, { targetDmMessage: { senderId: id } },
            { targetChatMessage: { senderId: id } }, { targetChatRoom: { createdById: id } },
          ],
        };
        [items, total] = await Promise.all([
          prisma.report.findMany({ where, select: { id: true, reporterId: true, targetUserId: true, targetPostId: true, targetCommentId: true, targetTaskId: true, targetCaseMessageId: true, targetHelpMessageId: true, targetDmMessageId: true, targetChatMessageId: true, targetChatRoomId: true, reason: true, details: true, status: true, resolution: true, resolutionAction: true, resolvedAt: true, resolvedById: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.report.count({ where }),
        ]); break;
      }
      case "punishments":
        [items, total] = await Promise.all([
          prisma.userPunishment.findMany({ where: { OR: [{ userId: id }, { operatorId: id }] }, select: { id: true, type: true, action: true, reason: true, details: true, userId: true, operatorId: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.userPunishment.count({ where: { OR: [{ userId: id }, { operatorId: id }] } }),
        ]); break;
      case "notifications":
        [items, total] = await Promise.all([
          prisma.notification.findMany({ where: { userId: id }, select: { id: true, type: true, title: true, content: true, isRead: true, link: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.notification.count({ where: { userId: id } }),
        ]); break;
      case "dm-threads": {
        const where = { OR: [{ participant1Id: id }, { participant2Id: id }] };
        [items, total] = await Promise.all([
          prisma.dMThread.findMany({ where, select: { id: true, participant1Id: true, participant2Id: true, isSystemReadOnly: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" }, ...paging }),
          prisma.dMThread.count({ where }),
        ]); break;
      }
      case "dm-messages": {
        const where = { thread: { OR: [{ participant1Id: id }, { participant2Id: id }] } };
        [items, total] = await Promise.all([
          prisma.dMMessage.findMany({ where, select: { id: true, threadId: true, senderId: true, content: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.dMMessage.count({ where }),
        ]); break;
      }
      case "chat-memberships": {
        const where = { userId: id };
        [items, total] = await Promise.all([
          prisma.chatRoomMember.findMany({ where, select: { id: true, userId: true, role: true, joinedAt: true, room: { select: { id: true, name: true, type: true, status: true, joinMode: true, createdById: true } } }, orderBy: { joinedAt: "desc" }, ...paging }),
          prisma.chatRoomMember.count({ where }),
        ]); break;
      }
      case "chat-messages":
        [items, total] = await Promise.all([
          prisma.chatMessage.findMany({ where: { senderId: id }, select: { id: true, roomId: true, senderId: true, content: true, createdAt: true, editedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.chatMessage.count({ where: { senderId: id } }),
        ]); break;
      case "chat-requests":
        [items, total] = await Promise.all([
          prisma.chatRoomJoinRequest.findMany({ where: { OR: [{ userId: id }, { reviewedBy: id }] }, select: { id: true, roomId: true, userId: true, status: true, reviewedBy: true, createdAt: true, updatedAt: true, room: { select: { name: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.chatRoomJoinRequest.count({ where: { OR: [{ userId: id }, { reviewedBy: id }] } }),
        ]); break;
      case "chat-bans": {
        const where = { OR: [{ userId: id }, { imposedById: id }, { revokedById: id }] };
        [items, total] = await Promise.all([
          prisma.chatRoomBan.findMany({ where, select: { id: true, roomId: true, userId: true, imposedById: true, reason: true, createdAt: true, expiresAt: true, revokedAt: true, revokedById: true, revokeReason: true, room: { select: { name: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.chatRoomBan.count({ where }),
        ]); break;
      }
      case "case-messages": {
        const where = { OR: [{ senderId: id }, { receiverId: id }] };
        [items, total] = await Promise.all([
          prisma.message.findMany({ where, select: { id: true, senderId: true, receiverId: true, caseId: true, sessionId: true, content: true, messageType: true, mediaName: true, mediaMimeType: true, mediaSize: true, durationSeconds: true, isAnonymous: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.message.count({ where }),
        ]); break;
      }
      case "help-sessions": {
        const where = { OR: [{ helperId: id }, { requesterId: id }] };
        [items, total] = await Promise.all([
          prisma.helpSession.findMany({ where, select: { id: true, taskId: true, helperId: true, requesterId: true, status: true, statusBeforeDispute: true, requesterConfirmed: true, helperConfirmed: true, createdAt: true, closedAt: true, helpChat: { select: { id: true } }, evidenceRoom: { select: { id: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.helpSession.count({ where }),
        ]); break;
      }
      case "help-messages": {
        const where = { OR: [{ senderId: id }, { chat: { session: { OR: [{ helperId: id }, { requesterId: id }] } } }] };
        [items, total] = await Promise.all([
          prisma.helpChatMessage.findMany({ where, select: { id: true, chatId: true, senderId: true, content: true, quotedMessageId: true, isSystemMessage: true, isEvidence: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.helpChatMessage.count({ where }),
        ]); break;
      }
      case "dcr-cases": {
        const where = { OR: [{ submitterId: id }, { handlerId: id }, { handlers: { some: { userId: id } } }] };
        [items, total] = await Promise.all([
          prisma.case.findMany({ where, select: { id: true, category: true, status: true, requestStatus: true, reviewNote: true, missingFields: true, sensitiveHitCount: true, grade: true, timeRange: true, province: true, city: true, riskPreference: true, evidenceChecklist: true, submitterId: true, handlerId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.case.count({ where }),
        ]); break;
      }
      case "dcr-applications":
        [items, total] = await Promise.all([
          prisma.accessApplication.findMany({ where: { applicantId: id }, select: { id: true, type: true, status: true, pledgeText: true, reviewNote: true, caseId: true, createdAt: true, reviewedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.accessApplication.count({ where: { applicantId: id } }),
        ]); break;
      case "dcr-tasks":
        [items, total] = await Promise.all([
          prisma.mutualAidTask.findMany({ where: { requesterId: id }, select: { id: true, title: true, category: true, summary: true, expectedHelpType: true, urgencyLevel: true, status: true, rejectionReason: true, closureReason: true, requesterConfirmed: true, helperConfirmed: true, caseId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.mutualAidTask.count({ where: { requesterId: id } }),
        ]); break;
      case "dcr-claims": {
        const where = { OR: [{ applicantId: id }, { requesterId: id }] };
        [items, total] = await Promise.all([
          prisma.helpClaim.findMany({ where, select: { id: true, status: true, applicantConfirmed: true, requesterConfirmed: true, targetTaskId: true, offeredTaskId: true, applicantId: true, requesterId: true, sessionId: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.helpClaim.count({ where }),
        ]); break;
      }
      case "dcr-evidence":
        [items, total] = await Promise.all([
          prisma.evidenceItem.findMany({ where: { uploaderId: id }, select: { id: true, roomId: true, uploaderId: true, type: true, description: true, fileName: true, fileSize: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.evidenceItem.count({ where: { uploaderId: id } }),
        ]); break;
      case "dcr-timeline":
        {
          const caseWhere = { case_: { OR: [{ submitterId: id }, { handlerId: id }, { handlers: { some: { userId: id } } }] } };
          const taskWhere = { OR: [{ operatorId: id }, { task: { requesterId: id } }] };
          const [caseTotal, taskTotal] = await Promise.all([
            prisma.timelineEvent.count({ where: caseWhere }),
            prisma.taskTimelineEvent.count({ where: taskWhere }),
          ]);
          ({ items, total } = await pageSections([
            { group: "caseTimeline", total: caseTotal, load: (sectionSkip, take) => prisma.timelineEvent.findMany({ where: caseWhere, select: { id: true, caseId: true, action: true, oldStatus: true, newStatus: true, details: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
            { group: "taskTimeline", total: taskTotal, load: (sectionSkip, take) => prisma.taskTimelineEvent.findMany({ where: taskWhere, select: { id: true, taskId: true, operatorId: true, action: true, oldStatus: true, newStatus: true, details: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          ], page, pageSize));
          break;
        }
      case "dcr-cycles": {
        const where = { OR: [{ initiatorId: id }, { links: { some: { OR: [{ fromUserId: id }, { toUserId: id }] } } }, { matchRequests: { some: { userId: id } } }] };
        [items, total] = await Promise.all([
          prisma.mutualAidCycle.findMany({ where, select: { id: true, initiatorId: true, status: true, mode: true, createdAt: true, updatedAt: true, links: { where: { OR: [{ fromUserId: id }, { toUserId: id }] }, select: { id: true, direction: true, fromUserId: true, toUserId: true, status: true, description: true, acceptedAt: true, completedAt: true } }, matchRequests: { where: { userId: id }, select: { id: true, status: true, needText: true, offerText: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.mutualAidCycle.count({ where }),
        ]); break;
      }
      case "psychology": {
        const where = { OR: [{ requesterId: id }, { listenerId: id }] };
        [items, total] = await Promise.all([
          prisma.confideRequest.findMany({ where, select: { id: true, summary: true, anonymousId: true, status: true, requesterId: true, listenerId: true, expiresAt: true, createdAt: true, closedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.confideRequest.count({ where }),
        ]); break;
      }
      case "dcr-private": {
        const caseWhere = { OR: [{ submitterId: id }, { handlerId: id }, { handlers: { some: { userId: id } } }] };
        const taskWhere = {
          OR: [
            { requesterId: id },
            { helpSessions: { some: { OR: [{ helperId: id }, { requesterId: id }] } } },
            { claimsAsTarget: { some: { OR: [{ applicantId: id }, { requesterId: id }] } } },
          ],
        };
        const [caseTotal, taskTotal] = await Promise.all([
          prisma.case.count({ where: caseWhere }),
          prisma.mutualAidTask.count({ where: taskWhere }),
        ]);
        ({ items, total } = await pageSections([
          { group: "cases", total: caseTotal, load: (sectionSkip, take) => prisma.case.findMany({ where: caseWhere, select: { id: true, category: true, status: true, requestStatus: true, formData: true, pledgeText: true, reviewNote: true, extractedFields: true, missingFields: true, evidenceChecklist: true, riskPreference: true, submitterId: true, handlerId: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "tasks", total: taskTotal, load: (sectionSkip, take) => prisma.mutualAidTask.findMany({ where: taskWhere, select: { id: true, requesterId: true, caseId: true, title: true, summary: true, expectedHelpType: true, structuredFields: true, attachments: true, riskFlags: true, completionReport: true, rejectionReason: true, closureReason: true, status: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
        ], page, pageSize));
        break;
      }
      case "identity": {
        const where = { OR: [{ applicantId: id }, { reviewerId: id }] };
        [items, total] = await Promise.all([
          prisma.identityVerificationApplication.findMany({ where, select: { id: true, applicantId: true, pendingApplicantId: true, method: true, status: true, evidenceMime: true, evidenceSize: true, evidenceDeleteAfter: true, reviewNote: true, reviewerId: true, createdAt: true, reviewedAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.identityVerificationApplication.count({ where }),
        ]); break;
      }
      case "auth-providers":
        [items, total] = await Promise.all([
          prisma.account.findMany({ where: { userId: id }, select: { id: true, userId: true, type: true, provider: true, providerAccountId: true, expires_at: true, token_type: true, scope: true }, orderBy: { provider: "asc" }, ...paging }),
          prisma.account.count({ where: { userId: id } }),
        ]); break;
      case "auth-sessions":
        [items, total] = await Promise.all([
          prisma.session.findMany({ where: { userId: id }, select: { id: true, userId: true, expires: true }, orderBy: { expires: "desc" }, ...paging }),
          prisma.session.count({ where: { userId: id } }),
        ]); break;
      case "invites": {
        const where = { OR: [{ creatorId: id }, { usedById: id }] };
        [items, total] = await Promise.all([
          prisma.inviteCode.findMany({ where, select: { id: true, isUsed: true, isRevoked: true, dcrContributionAccess: true, expiresAt: true, createdAt: true, usedAt: true, creatorId: true, usedById: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.inviteCode.count({ where }),
        ]); break;
      }
      case "announcements": {
        const where = { OR: [{ createdById: id }, { receipts: { some: { userId: id } } }, { deliveries: { some: { userId: id } } }] };
        [items, total] = await Promise.all([
          prisma.announcement.findMany({ where, select: { id: true, title: true, content: true, revision: true, forcePopup: true, isPublished: true, publishedAt: true, createdAt: true, updatedAt: true, createdById: true, receipts: { where: { userId: id }, select: { revision: true, dismissedAt: true } }, deliveries: { where: { userId: id }, select: { status: true, attemptCount: true, deliveredAt: true } } }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.announcement.count({ where }),
        ]); break;
      }
      case "qq": {
        const [grantTotal, draftTotal, conversation, identity] = await Promise.all([
          prisma.qQGrant.count({ where: { userId: id } }),
          prisma.qQDelegationDraft.count({ where: { ownerId: id } }),
          prisma.qQConversation.findUnique({ where: { ownerId: id }, select: { id: true, ownerId: true, state: true, step: true, revision: true, createdAt: true, updatedAt: true, expiresAt: true } }),
          prisma.qQIdentity.findUnique({ where: { userId: id }, select: { id: true, userId: true, createdAt: true, updatedAt: true, _count: { select: { outboxMessages: true } } } }),
        ]);
        const outboxTotal = identity?._count.outboxMessages ?? 0;
        ({ items, total } = await pageSections([
          { group: "grants", total: grantTotal, load: (sectionSkip, take) => prisma.qQGrant.findMany({ where: { userId: id }, select: { id: true, purpose: true, userId: true, draftId: true, targetId: true, pendingRegistrationId: true, createdAt: true, expiresAt: true, consumedAt: true, revokedAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "drafts", total: draftTotal, load: (sectionSkip, take) => prisma.qQDelegationDraft.findMany({ where: { ownerId: id }, select: { id: true, ownerId: true, schemaVersion: true, createdAt: true, updatedAt: true, expiresAt: true, finalizedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "conversation", total: conversation ? 1 : 0, load: async () => conversation ? [conversation] : [] },
          { group: "identity", total: identity ? 1 : 0, load: async () => identity ? [{ id: identity.id, userId: identity.userId, createdAt: identity.createdAt, updatedAt: identity.updatedAt }] : [] },
          { group: "outbox", total: outboxTotal, load: (sectionSkip, take) => prisma.qQMessageOutbox.findMany({ where: { identityId: identity!.id }, select: { id: true, status: true, attemptCount: true, nextAttemptAt: true, providerMessageId: true, createdAt: true, updatedAt: true, deliveredAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
        ], page, pageSize));
        break;
      }
      case "qq-private": {
        const identity = await prisma.qQIdentity.findUnique({ where: { userId: id }, select: { id: true, lookupHash: true } });
        const [draftTotal, conversation, inboxTotal, outboxTotal] = await Promise.all([
          prisma.qQDelegationDraft.count({ where: { ownerId: id } }),
          prisma.qQConversation.findUnique({ where: { ownerId: id }, select: { id: true, state: true, step: true, revision: true, payload: true, createdAt: true, updatedAt: true, expiresAt: true } }),
          identity ? prisma.qQBotEventInbox.count({ where: { lookupHash: identity.lookupHash } }) : 0,
          identity ? prisma.qQMessageOutbox.count({ where: { identityId: identity.id } }) : 0,
        ]);
        ({ items, total } = await pageSections([
          { group: "drafts", total: draftTotal, load: (sectionSkip, take) => prisma.qQDelegationDraft.findMany({ where: { ownerId: id }, select: { id: true, schemaVersion: true, payload: true, createdAt: true, updatedAt: true, expiresAt: true, finalizedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "conversation", total: conversation ? 1 : 0, load: async () => conversation ? [conversation] : [] },
          { group: "inbox", total: inboxTotal, load: async (sectionSkip, take) => {
            if (!identity) return [];
            const inbox = await prisma.qQBotEventInbox.findMany({ where: { lookupHash: identity.lookupHash }, select: { id: true, eventId: true, selfId: true, response: true, inputCiphertext: true, inputIv: true, inputAuthTag: true, inputKeyVersion: true, replyCiphertext: true, replyIv: true, replyAuthTag: true, replyKeyVersion: true, createdAt: true, processedAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take });
            return inbox.map((row) => {
              let input: unknown = null;
              let replies: unknown = null;
              try { const envelope = encrypted(row as unknown as Record<string, unknown>, "input"); if (envelope) input = decryptQQAuditValue(envelope, `qq-inbox-input:${row.eventId}`); } catch {}
              try { const envelope = encrypted(row as unknown as Record<string, unknown>, "reply"); if (envelope) replies = decryptQQAuditValue(envelope, `qq-inbox-replies:${row.eventId}`); } catch {}
              return { id: row.id, eventId: row.eventId, selfId: row.selfId, input: sanitizeQQContent(input), replies: sanitizeQQContent(replies), responseState: sanitizeQQContent(row.response), createdAt: row.createdAt, processedAt: row.processedAt };
            });
          } },
          { group: "outbox", total: outboxTotal, load: async (sectionSkip, take) => identity ? (await prisma.qQMessageOutbox.findMany({ where: { identityId: identity.id }, select: { id: true, content: true, status: true, attemptCount: true, nextAttemptAt: true, providerMessageId: true, lastError: true, createdAt: true, updatedAt: true, deliveredAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take })).map((row) => ({ ...row, content: redactSensitiveQQText(row.content), lastError: row.lastError ? redactSensitiveQQText(row.lastError) : null })) : [] },
        ], page, pageSize));
        break;
      }
      case "audit": {
        const where = { OR: [{ operatorId: id }, { targetType: AuditTargetType.USER, targetId: id }] };
        [items, total] = await Promise.all([
          prisma.auditLog.findMany({ where, select: { id: true, action: true, targetType: true, targetId: true, details: true, operatorId: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.auditLog.count({ where }),
        ]); break;
      }
      case "diagnostics": {
        const [logsTotal, telemetryTotal, moderationTotal, systemConfig, aiConfig, siteContent] = await Promise.all([
          prisma.systemLog.count({ where: { userId: id } }),
          prisma.telemetryEvent.count({ where: { userId: id } }),
          prisma.moderationAction.count({ where: { operatorId: id } }),
          prisma.systemConfig.findMany({ where: { updatedById: id }, select: { id: true, revision: true, updatedAt: true, updatedById: true } }),
          prisma.aiRuntimeConfig.findMany({ where: { updatedById: id }, select: { id: true, enabled: true, baseUrl: true, defaultModel: true, complexModel: true, timeoutMs: true, maxInputChars: true, maxOutputTokens: true, revision: true, updatedAt: true, updatedById: true } }),
          prisma.siteContent.findMany({ where: { updatedBy: id }, select: { id: true, key: true, title: true, revision: true, updatedAt: true, updatedBy: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
        ]);
        const configuration = [...systemConfig, ...aiConfig, ...siteContent];
        ({ items, total } = await pageSections([
          { group: "systemLogs", total: logsTotal, load: (sectionSkip, take) => prisma.systemLog.findMany({ where: { userId: id }, select: { id: true, level: true, source: true, message: true, detail: true, userId: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "telemetry", total: telemetryTotal, load: (sectionSkip, take) => prisma.telemetryEvent.findMany({ where: { userId: id }, select: { id: true, scope: true, type: true, name: true, route: true, duration: true, value: true, status: true, release: true, userAgent: true, metadata: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "moderation", total: moderationTotal, load: (sectionSkip, take) => prisma.moderationAction.findMany({ where: { operatorId: id }, select: { id: true, actionType: true, targetType: true, targetId: true, reason: true, details: true, operatorId: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: sectionSkip, take }) },
          { group: "configuration", total: configuration.length, load: async (sectionSkip, take) => configuration.slice(sectionSkip, sectionSkip + take) },
        ], page, pageSize));
        break;
      }
      case "ai":
        [items, total] = await Promise.all([
          prisma.aiReview.findMany({ where: { requestedById: id }, select: { id: true, feature: true, targetType: true, targetId: true, targetVersion: true, status: true, provider: true, model: true, schemaVersion: true, riskLevel: true, confidence: true, recommendation: true, result: true, redactionCount: true, containsPrivateData: true, requestedById: true, createdAt: true, completedAt: true, expiresAt: true }, orderBy: { createdAt: "desc" }, ...paging }),
          prisma.aiReview.count({ where: { requestedById: id } }),
        ]); break;
    }

    await logAudit(
      req.user.id,
      privateDomains.has(domain)
        ? AuditAction.ADMIN_PRIVATE_USER_CONTENT_VIEW
        : diagnosticDomains.has(domain) ? AuditAction.ADMIN_USER_DIAGNOSTIC_VIEW : AuditAction.ADMIN_USER_DETAIL_VIEW,
      AuditTargetType.USER,
      id,
      { domain, page, pageSize },
    );

    return NextResponse.json(
      { domain, ...pageOf(items, total, page, pageSize) },
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "SUPER_ADMIN");
