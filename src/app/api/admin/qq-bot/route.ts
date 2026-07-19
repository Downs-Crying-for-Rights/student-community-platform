import { NextResponse } from "next/server";
import { Prisma, QQOutboxStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getQQBotHeartbeat } from "@/lib/qq-bot-monitor";
import { QQ_OUTBOX_MAX_ATTEMPTS, QQ_OUTBOX_STALE_AFTER_MS } from "@/lib/qq-outbox";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  kind: z.enum(["ALL", "INBOX", "OUTBOX"]).default("ALL"),
  status: z.enum(["PENDING", "PROCESSING", "DELIVERED", "RETRY", "FAILED"]).optional(),
});

function enabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function shortId(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "查询参数无效" }, { status: 400 });

  const { hours, page, pageSize, kind, status } = parsed.data;
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1_000);
  const staleBefore = new Date(now.getTime() - QQ_OUTBOX_STALE_AFTER_MS);
  const outboxWhere: Prisma.QQMessageOutboxWhereInput = {
    createdAt: { gte: since },
    ...(status ? { status } : {}),
  };
  const inboxWhere: Prisma.QQBotEventInboxWhereInput = { createdAt: { gte: since } };

  const [
    heartbeat,
    identities,
    activeConversations,
    activeDrafts,
    pendingGrants,
    inboxTotal,
    inboxPending,
    outboxFilteredTotal,
    outboxGroups,
    readyOutbox,
    staleOutbox,
    inboxRows,
    outboxRows,
  ] = await Promise.all([
    getQQBotHeartbeat(),
    prisma.qQIdentity.count(),
    prisma.qQConversation.count({ where: { state: "DELEGATION_FORM", expiresAt: { gt: now } } }),
    prisma.qQDelegationDraft.count({ where: { finalizedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.qQGrant.count({ where: { consumedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.qQBotEventInbox.count({ where: inboxWhere }),
    prisma.qQBotEventInbox.count({ where: { ...inboxWhere, processedAt: null } }),
    prisma.qQMessageOutbox.count({ where: outboxWhere }),
    prisma.qQMessageOutbox.groupBy({
      by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true },
    }),
    prisma.qQMessageOutbox.count({
      where: { status: { in: [QQOutboxStatus.PENDING, QQOutboxStatus.RETRY] }, nextAttemptAt: { lte: now } },
    }),
    prisma.qQMessageOutbox.count({
      where: { status: QQOutboxStatus.PROCESSING, updatedAt: { lte: staleBefore } },
    }),
    kind === "OUTBOX" || status ? Promise.resolve([]) : prisma.qQBotEventInbox.findMany({
      where: inboxWhere,
      orderBy: { createdAt: "desc" },
      take: page * pageSize,
      select: { id: true, eventId: true, selfId: true, createdAt: true, processedAt: true },
    }),
    kind === "INBOX" ? Promise.resolve([]) : prisma.qQMessageOutbox.findMany({
      where: outboxWhere,
      orderBy: { createdAt: "desc" },
      take: page * pageSize,
      select: {
        id: true, status: true, attemptCount: true, nextAttemptAt: true,
        lastError: true, createdAt: true, updatedAt: true, deliveredAt: true,
      },
    }),
  ]);

  const events = [
    ...inboxRows.map((row) => ({
      id: row.id,
      kind: "INBOX" as const,
      reference: shortId(row.eventId),
      status: row.processedAt ? "PROCESSED" : "PENDING",
      attempts: null,
      error: null,
      selfId: row.selfId,
      createdAt: row.createdAt,
      updatedAt: row.processedAt ?? row.createdAt,
      latencyMs: row.processedAt ? row.processedAt.getTime() - row.createdAt.getTime() : null,
      nextAttemptAt: null,
    })),
    ...outboxRows.map((row) => ({
      id: row.id,
      kind: "OUTBOX" as const,
      reference: shortId(row.id),
      status: row.status,
      attempts: row.attemptCount,
      error: row.lastError,
      selfId: null,
      createdAt: row.createdAt,
      updatedAt: row.deliveredAt ?? row.updatedAt,
      latencyMs: row.deliveredAt ? row.deliveredAt.getTime() - row.createdAt.getTime() : null,
      nextAttemptAt: row.status === QQOutboxStatus.RETRY ? row.nextAttemptAt : null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const filteredEvents = events.slice((page - 1) * pageSize, page * pageSize);
  const eventTotal = status
    ? outboxFilteredTotal
    : kind === "INBOX"
    ? inboxTotal
    : kind === "OUTBOX"
      ? outboxFilteredTotal
      : inboxTotal + outboxFilteredTotal;
  const outbox = Object.fromEntries(Object.values(QQOutboxStatus).map((value) => [value, 0])) as Record<QQOutboxStatus, number>;
  for (const group of outboxGroups) outbox[group.status] = group._count._all;
  const botEnabled = enabled(process.env.QQ_BOT_ENABLED);
  const expectedSelfId = process.env.QQ_BOT_EXPECTED_SELF_ID || null;
  const heartbeatMatches = Boolean(heartbeat && expectedSelfId && heartbeat.selfId === expectedSelfId);
  const runtimeStatus = !botEnabled ? "DISABLED"
    : !heartbeatMatches ? "WORKER_OFFLINE"
      : !heartbeat?.oneBotConnected ? "ONEBOT_OFFLINE"
        : !heartbeat.accountOnline ? "ACCOUNT_OFFLINE" : "ONLINE";

  return NextResponse.json({
    generatedAt: now,
    hours,
    worker: {
      enabled: botEnabled,
      status: runtimeStatus,
      expectedSelfId,
      heartbeatAt: heartbeat?.recordedAt ?? null,
      heartbeatMatches,
      oneBotConnected: heartbeat?.oneBotConnected ?? false,
      accountOnline: heartbeat?.accountOnline ?? false,
      accountCheckedAt: heartbeat?.checkedAt ?? null,
    },
    summary: {
      identities,
      activeConversations,
      activeDrafts,
      pendingGrants,
      inboxTotal,
      inboxPending,
      readyOutbox,
      staleOutbox,
      outbox,
      maxAttempts: QQ_OUTBOX_MAX_ATTEMPTS,
    },
    events: filteredEvents,
    pagination: { page, pageSize, total: eventTotal, totalPages: Math.max(1, Math.ceil(eventTotal / pageSize)) },
  }, { headers: { "Cache-Control": "no-store" } });
}, "SUPER_ADMIN");
