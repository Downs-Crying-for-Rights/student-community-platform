import { decryptEnvelope, encryptEnvelope, type EncryptedEnvelope } from "@/lib/encrypted-envelope";
import { getQQConfig } from "@/lib/qq-config";
import type { QQBotMessage, QQBotResponse } from "@/lib/qq-bot-contract";

export function encryptQQAuditValue(value: unknown, context: string): EncryptedEnvelope {
  const config = getQQConfig();
  return encryptEnvelope(JSON.stringify(value), config.identityEncryptionKey, config.keyVersion, context);
}

export function decryptQQAuditValue(envelope: EncryptedEnvelope, context: string): unknown {
  return JSON.parse(decryptEnvelope(envelope, getQQConfig().identityEncryptionKey, context));
}

export function encryptQQMessageInput(message: QQBotMessage): EncryptedEnvelope {
  return encryptQQAuditValue({
    senderId: message.userId,
    conversation: message.conversation,
    input: message.input,
    occurredAt: message.occurredAt,
  }, `qq-inbox-input:${message.eventId}`);
}

export function encryptQQMessageReplies(eventId: string, response: QQBotResponse): EncryptedEnvelope {
  return encryptQQAuditValue(response.replies, `qq-inbox-replies:${eventId}`);
}

export function redactSensitiveQQText(value: string): string {
  return value
    .replace(/([?&](?:token|api[_-]?key|secret)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\bqqg_[A-Za-z0-9_-]+\b/g, "[REDACTED_GRANT]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]");
}
