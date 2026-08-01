import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { decryptQQAuditValue, redactSensitiveQQText } from "@/lib/qq-message-audit";
import { decryptQQIdentity, decryptQQOfficialIdentity } from "@/lib/qq-identity";
import { getQQConfig } from "@/lib/qq-config";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const idSchema = z.string().cuid();
const kindSchema = z.enum(["INBOX", "OUTBOX"]);

function encrypted(row: Record<string, unknown>, prefix: "input" | "reply") {
  const ciphertext = row[`${prefix}Ciphertext`];
  const iv = row[`${prefix}Iv`];
  const authTag = row[`${prefix}AuthTag`];
  const keyVersion = row[`${prefix}KeyVersion`];
  if (typeof ciphertext !== "string" || typeof iv !== "string" || typeof authTag !== "string" || typeof keyVersion !== "number") return null;
  return { ciphertext, iv, authTag, keyVersion };
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveQQText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}

export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) return NextResponse.json({ error: "事件 ID 无效" }, { status: 400 });
  const parsedKind = kindSchema.safeParse(new URL(req.url).searchParams.get("kind") || "INBOX");
  if (!parsedKind.success) return NextResponse.json({ error: "事件类型无效" }, { status: 400 });
  if (parsedKind.data === "OUTBOX") {
    const message = await prisma.qQMessageOutbox.findUnique({
      where: { id: parsedId.data },
      select: { id: true, content: true, status: true, attemptCount: true, nextAttemptAt: true, providerMessageId: true, lastError: true, createdAt: true, updatedAt: true, deliveredAt: true },
    });
    if (!message) return NextResponse.json({ error: "事件不存在" }, { status: 404 });
    await logAudit(req.user.id, AuditAction.QQ_MESSAGE_CONTENT_VIEW, AuditTargetType.QQ_MESSAGE, message.id, { kind: "OUTBOX", redactionApplied: true });
    return NextResponse.json({ event: {
      id: message.id, kind: "OUTBOX", content: redactSensitiveQQText(message.content), status: message.status,
      attemptCount: message.attemptCount, nextAttemptAt: message.nextAttemptAt,
      providerMessageId: message.providerMessageId, lastError: message.lastError,
      createdAt: message.createdAt, updatedAt: message.updatedAt, deliveredAt: message.deliveredAt,
    } }, { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } });
  }
  const row = await prisma.qQBotEventInbox.findUnique({ where: { id: parsedId.data } });
  if (!row) return NextResponse.json({ error: "事件不存在" }, { status: 404 });
  const [identity, officialIdentity] = await Promise.all([
    prisma.qQIdentity.findUnique({
      where: { lookupHash: row.lookupHash },
      select: {
        ciphertext: true, iv: true, authTag: true, keyVersion: true,
        user: { select: { id: true, username: true, nickname: true, email: true, role: true, isBanned: true, createdAt: true } },
      },
    }),
    prisma.qQOfficialIdentity.findUnique({
      where: { lookupHash: row.lookupHash },
      select: {
        ciphertext: true, iv: true, authTag: true, keyVersion: true,
        user: { select: { id: true, username: true, nickname: true, email: true, role: true, isBanned: true, createdAt: true } },
      },
    }),
  ]);
  const bound = identity ?? officialIdentity;
  let senderIdentity: string | null = null;
  let provider: "QQ_OFFICIAL" | "ONEBOT11" | null = null;
  if (officialIdentity) {
    try {
      senderIdentity = decryptQQOfficialIdentity(officialIdentity, getQQConfig().identityEncryptionKey);
      provider = "QQ_OFFICIAL";
    } catch { senderIdentity = null; }
  }
  if (!senderIdentity && identity) {
    try {
      senderIdentity = decryptQQIdentity(identity, getQQConfig().identityEncryptionKey);
      provider = "ONEBOT11";
    } catch { senderIdentity = null; }
  }

  let input: unknown = null;
  let replies: unknown = null;
  const inputEnvelope = encrypted(row as unknown as Record<string, unknown>, "input");
  const replyEnvelope = encrypted(row as unknown as Record<string, unknown>, "reply");
  if (inputEnvelope) input = decryptQQAuditValue(inputEnvelope, `qq-inbox-input:${row.eventId}`);
  if (replyEnvelope) replies = decryptQQAuditValue(replyEnvelope, `qq-inbox-replies:${row.eventId}`);
  else if (row.response && typeof row.response === "object" && "replies" in row.response) replies = (row.response as { replies?: unknown }).replies ?? null;
  const encryptedSenderId = input && typeof input === "object" && "senderId" in input
    ? (input as { senderId?: unknown }).senderId : null;
  const auditedIdentity = senderIdentity ?? (typeof encryptedSenderId === "string" && /^[1-9]\d{4,11}$/.test(encryptedSenderId)
    ? encryptedSenderId : null);
  const sender = bound || auditedIdentity ? {
    provider,
    identity: auditedIdentity,
    username: bound?.user.username ?? null,
    nickname: bound?.user.nickname ?? null,
    userId: bound?.user.id ?? null,
    role: bound?.user.role ?? null,
    isBanned: bound?.user.isBanned ?? null,
    accountCreatedAt: bound?.user.createdAt ?? null,
  } : null;

  await logAudit(req.user.id, AuditAction.QQ_MESSAGE_CONTENT_VIEW, AuditTargetType.QQ_MESSAGE, row.id, {
    inputAvailable: input !== null,
    repliesAvailable: replies !== null,
    redactionApplied: true,
  });
  return NextResponse.json({ event: {
    kind: "INBOX",
    id: row.id,
    eventId: row.eventId,
    selfId: row.selfId,
    sender,
    input: sanitize(input),
    replies: sanitize(replies),
    responseState: row.response && typeof row.response === "object" && "conversation" in row.response
      ? (row.response as { conversation?: unknown }).conversation : null,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  } }, { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } });
}, "SUPER_ADMIN");
