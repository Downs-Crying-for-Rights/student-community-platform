import prisma from "./prisma";

/**
 * Cleanup report returned by runAllCleanup
 */
export interface CleanupReport {
  expiredConfideRequests: number;
  oldAnonymousSessionMessages: number;
  archivedCases: number;
  archivableAuditLogs: number;
  expiredListeningSessions: number;
  executedAt: string;
}

/**
 * Clean up expired confide requests that have passed their expiresAt date.
 * Deletes the ConfideRequest records and associated session messages.
 *
 * Validates: Requirements 12.6
 */
export async function cleanupExpiredConfideRequests(): Promise<number> {
  const now = new Date();

  const expired = await prisma.confideRequest.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  const expiredIds = expired.map((r) => r.id);

  // Delete associated session messages first (messages linked via sessionId)
  await prisma.message.deleteMany({
    where: { sessionId: { in: expiredIds } },
  });

  // Delete the confide requests
  const result = await prisma.confideRequest.deleteMany({
    where: { id: { in: expiredIds } },
  });

  return result.count;
}

/**
 * Clean up anonymous session messages older than 90 days
 * that are not linked to a case (pure anonymous/psych sessions).
 *
 * Validates: Requirements 19.4
 */
export async function cleanupOldAnonymousSessions(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const result = await prisma.message.deleteMany({
    where: {
      isAnonymous: true,
      caseId: null,
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}

/**
 * Desensitize and archive closed cases older than 180 days.
 * Replaces formData with an archived placeholder to remove PII
 * while keeping the record for reference.
 *
 * Validates: Requirements 19.5
 */
export async function archiveOldCases(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  const result = await prisma.case.updateMany({
    where: {
      status: "CLOSED",
      updatedAt: { lt: cutoff },
      // Only archive cases that haven't been archived yet
      NOT: {
        formData: { equals: { archived: true } },
      },
    },
    data: {
      formData: { archived: true, archivedAt: new Date().toISOString() },
    },
  });

  return result.count;
}

/**
 * Count audit logs older than 180 days that are archivable.
 * Since audit logs are immutable (no update/delete), we only count them
 * for reporting purposes.
 *
 * Validates: Requirements 16.5
 */
export async function countArchivableAuditLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  return prisma.auditLog.count({
    where: { createdAt: { lt: cutoff } },
  });
}

/**
 * Clean up listening session messages older than 30 days.
 * These are messages with a sessionId (confide session messages).
 *
 * Validates: Requirements 12.6
 */
export async function cleanupExpiredListeningSessions(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const result = await prisma.message.deleteMany({
    where: {
      sessionId: { not: null },
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}

/**
 * Run all cleanup tasks and return a consolidated report.
 *
 * Validates: Requirements 19.4, 19.5, 16.5, 12.6
 */
export async function runAllCleanup(): Promise<CleanupReport> {
  const [
    expiredConfideRequests,
    oldAnonymousSessionMessages,
    archivedCases,
    archivableAuditLogs,
    expiredListeningSessions,
  ] = await Promise.all([
    cleanupExpiredConfideRequests(),
    cleanupOldAnonymousSessions(),
    archiveOldCases(),
    countArchivableAuditLogs(),
    cleanupExpiredListeningSessions(),
  ]);

  return {
    expiredConfideRequests,
    oldAnonymousSessionMessages,
    archivedCases,
    archivableAuditLogs,
    expiredListeningSessions,
    executedAt: new Date().toISOString(),
  };
}
