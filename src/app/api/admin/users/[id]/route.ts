import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        email: true,
        username: true,
        emailVerified: true,
        nickname: true,
        avatar: true,
        bio: true,
        role: true,
        isBanned: true,
        isShadowBanned: true,
        isAnonymous: true,
        violationCount: true,
        onboardingDone: true,
        psychAccess: true,
        dcrAccess: true,
        dcrContributionAccess: true,
        dcrHelperAccess: true,
        dcrPledgeSigned: true,
        quizPassed: true,
        phone: true,
        securityVersion: true,
        profileCompletionRequired: true,
        realVerifiedAt: true,
        studentVerifiedAt: true,
        dmConsentVersion: true,
        dmConsentAcceptedAt: true,
        createdAt: true,
        updatedAt: true,
        deactivatedAt: true,
        accounts: {
          select: { id: true, type: true, provider: true, providerAccountId: true, expires_at: true, token_type: true, scope: true },
          orderBy: { provider: "asc" },
        },
        sessions: { select: { id: true, expires: true }, orderBy: { expires: "desc" }, take: 20 },
        identityVerificationApplications: {
          select: {
            id: true, method: true, status: true, evidenceMime: true, evidenceSize: true,
            evidenceDeleteAfter: true, reviewNote: true, reviewerId: true, createdAt: true, reviewedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        qqIdentity: { select: { id: true, createdAt: true, updatedAt: true } },
        pendingQQRegistration: { select: { id: true, username: true, createdAt: true, expiresAt: true, consumedAt: true } },
        accountDeletionRequest: {
          select: { id: true, status: true, reason: true, reviewNote: true, requestedAt: true, updatedAt: true, reviewedAt: true, completedAt: true, reviewerId: true },
        },
        _count: {
          select: {
            accounts: true, sessions: true, posts: true, postRevisionsEdited: true, postRevisionsReviewed: true, comments: true, likes: true, bookmarks: true,
            reportsFiled: true, reportsReceived: true, reportsResolved: true, casesSubmitted: true, casesHandled: true,
            caseHandlers: true, confideRequests: true, listeningTaken: true, notifications: true, auditLogs: true,
            punishmentsReceived: true, punishmentsIssued: true, aiReviewsRequested: true, messagesSent: true,
            messagesReceived: true, invitesCreated: true, accessApplications: true, tasksRequested: true,
            initiatedCycles: true, linksAsFrom: true, linksAsTo: true, dmThreadsAsP1: true, dmThreadsAsP2: true,
            dmMessagesSent: true, announcementReceipts: true, announcementDeliveries: true, chatRooms: true,
            chatMemberships: true, chatJoinRequests: true, chatRoomBans: true, chatBansImposed: true,
            chatBansRevoked: true, qqDelegationDrafts: true, qqGrants: true,
            identityVerificationApplications: true, identityVerificationReviews: true,
          },
        },
      },
    });

    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const [
      chatMessages, helpSessions, helpClaims, helpMessages, evidenceItems, taskTimeline,
      moderationActions, announcementsCreated, systemLogs, telemetryEvents, configUpdates,
    ] = await Promise.all([
      prisma.chatMessage.count({ where: { senderId: id } }),
      prisma.helpSession.count({ where: { OR: [{ helperId: id }, { requesterId: id }] } }),
      prisma.helpClaim.count({ where: { OR: [{ applicantId: id }, { requesterId: id }] } }),
      prisma.helpChatMessage.count({ where: { senderId: id } }),
      prisma.evidenceItem.count({ where: { uploaderId: id } }),
      prisma.taskTimelineEvent.count({ where: { operatorId: id } }),
      prisma.moderationAction.count({ where: { operatorId: id } }),
      prisma.announcement.count({ where: { createdById: id } }),
      prisma.systemLog.count({ where: { userId: id } }),
      prisma.telemetryEvent.count({ where: { userId: id } }),
      Promise.all([
        prisma.systemConfig.count({ where: { updatedById: id } }),
        prisma.aiRuntimeConfig.count({ where: { updatedById: id } }),
      ]).then(([system, ai]) => system + ai),
    ]);

    const { _count, ...account } = user;
    await logAudit(req.user.id, AuditAction.ADMIN_USER_DETAIL_VIEW, AuditTargetType.USER, id, {
      section: "summary",
    });
    return NextResponse.json({
      user: account,
      counts: {
        ..._count,
        chatMessages,
        helpSessions,
        helpClaims,
        helpMessages,
        evidenceItems,
        taskTimeline,
        moderationActions,
        announcementsCreated,
        systemLogs,
        telemetryEvents,
        configUpdates,
      },
    }, { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "SUPER_ADMIN");
