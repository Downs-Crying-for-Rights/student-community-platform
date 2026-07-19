import { Prisma, PrismaClient, QQOutboxStatus } from "@prisma/client";

import { isValidInternalBearer } from "./qq-bot-contract";
import { getQQConfig } from "./qq-config";
import { decryptQQIdentity } from "./qq-identity";
import prisma from "./prisma";

export const QQ_OUTBOX_CLAIM_LIMIT = 10;
export const QQ_OUTBOX_MAX_ATTEMPTS = 5;
export const QQ_OUTBOX_STALE_AFTER_MS = 5 * 60 * 1_000;
export const QQ_OUTBOX_INITIAL_RETRY_MS = 30 * 1_000;
export const QQ_OUTBOX_MAX_RETRY_MS = 60 * 60 * 1_000;

export interface ClaimedQQMessage {
  id: string;
  userId: string;
  content: string;
}

interface ClaimedQQMessageRow {
  id: string;
  userId: string;
  content: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface QQOutboxFailureDisposition {
  status: "RETRY" | "FAILED";
  nextAttemptAt: Date;
}

export interface QQOutboxEnqueueClient {
  qQIdentity: {
    findUnique(args: {
      where: { userId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  qQMessageOutbox: {
    createMany(args: {
      data: Array<{
        dedupeKey: string;
        identityId: string;
        content: string;
      }>;
      skipDuplicates: true;
    }): Promise<{ count: number }>;
  };
}

export function authorizeQQInternalRequest(request: Request):
  | { ok: true }
  | { ok: false; status: 401 | 503 } {
  if (
    !isValidInternalBearer(
      request.headers.get("authorization"),
      process.env.INTERNAL_API_TOKEN,
    )
  ) {
    return { ok: false, status: 401 };
  }

  const enabled = process.env.QQ_BOT_ENABLED;
  if (
    (enabled !== "1" && enabled !== "true") ||
    !process.env.QQ_BOT_EXPECTED_SELF_ID
  ) {
    return { ok: false, status: 503 };
  }

  return { ok: true };
}

export function getQQOutboxFailureDisposition(
  attemptCount: number,
  now = new Date(),
): QQOutboxFailureDisposition {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new Error("QQ_OUTBOX_INVALID_ATTEMPT_COUNT");
  }
  if (Number.isNaN(now.getTime())) throw new Error("QQ_OUTBOX_INVALID_TIME");

  if (attemptCount >= QQ_OUTBOX_MAX_ATTEMPTS) {
    return { status: "FAILED", nextAttemptAt: now };
  }

  const delay = Math.min(
    QQ_OUTBOX_INITIAL_RETRY_MS * 2 ** (attemptCount - 1),
    QQ_OUTBOX_MAX_RETRY_MS,
  );
  return { status: "RETRY", nextAttemptAt: new Date(now.getTime() + delay) };
}

export async function enqueueQQMessageForUser(
  client: QQOutboxEnqueueClient,
  userId: string,
  dedupeKey: string,
  content: string,
): Promise<boolean> {
  const identity = await client.qQIdentity.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!identity) return false;

  const result = await client.qQMessageOutbox.createMany({
    data: [{ dedupeKey, identityId: identity.id, content }],
    skipDuplicates: true,
  });
  return result.count === 1;
}

export async function claimQQOutboxMessages(
  client: PrismaClient = prisma,
  now = new Date(),
  limit = QQ_OUTBOX_CLAIM_LIMIT,
): Promise<ClaimedQQMessage[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > QQ_OUTBOX_CLAIM_LIMIT) {
    throw new Error("QQ_OUTBOX_INVALID_CLAIM_LIMIT");
  }
  const staleBefore = new Date(now.getTime() - QQ_OUTBOX_STALE_AFTER_MS);
  const encryptionKey = getQQConfig().identityEncryptionKey;

  return client.$transaction(async (tx) => {
    await tx.qQMessageOutbox.updateMany({
      where: {
        status: QQOutboxStatus.PROCESSING,
        updatedAt: { lte: staleBefore },
        attemptCount: { gte: QQ_OUTBOX_MAX_ATTEMPTS },
      },
      data: {
        status: QQOutboxStatus.FAILED,
        lastError: "CLAIM_LEASE_EXPIRED",
      },
    });

    const rows = await tx.$queryRaw<ClaimedQQMessageRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT outbox."id"
        FROM "QQMessageOutbox" AS outbox
        WHERE (
          outbox."status" IN ('PENDING'::"QQOutboxStatus", 'RETRY'::"QQOutboxStatus")
          AND outbox."nextAttemptAt" <= ${now}
        ) OR (
          outbox."status" = 'PROCESSING'::"QQOutboxStatus"
          AND outbox."updatedAt" <= ${staleBefore}
          AND outbox."attemptCount" < ${QQ_OUTBOX_MAX_ATTEMPTS}
        )
        ORDER BY outbox."nextAttemptAt" ASC, outbox."createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE "QQMessageOutbox" AS outbox
        SET "status" = 'PROCESSING'::"QQOutboxStatus",
            "attemptCount" = outbox."attemptCount" + 1,
            "updatedAt" = ${now}
        FROM candidates
        WHERE outbox."id" = candidates."id"
        RETURNING outbox."id", outbox."identityId", outbox."content"
      )
      SELECT claimed."id", identity."userId", claimed."content",
             identity."ciphertext", identity."iv", identity."authTag", identity."keyVersion"
      FROM claimed
      JOIN "QQIdentity" AS identity ON identity."id" = claimed."identityId"
    `);

    const messages: ClaimedQQMessage[] = [];
    for (const row of rows) {
      try {
        messages.push({
          id: row.id,
          userId: decryptQQIdentity(row, encryptionKey),
          content: row.content,
        });
      } catch {
        await tx.qQMessageOutbox.updateMany({
          where: { id: row.id, status: QQOutboxStatus.PROCESSING },
          data: {
            status: QQOutboxStatus.FAILED,
            lastError: "IDENTITY_DECRYPT_FAILED",
          },
        });
      }
    }
    return messages;
  });
}
