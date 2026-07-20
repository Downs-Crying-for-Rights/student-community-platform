import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";

import { decryptEnvelope, encryptEnvelope, type EncryptedEnvelope } from "@/lib/encrypted-envelope";
import { getIdentityVerificationConfig } from "@/lib/identity-verification-config";

export const PHOTO_METHODS = ["STUDENT_DOCUMENT", "ID_HOLDING_PHOTO", "SCHOOL_UNIFORM"] as const;
export const IDENTITY_METHODS = [...PHOTO_METHODS, "REAL_NAME_ID"] as const;

export const identityMethodSchema = z.enum(IDENTITY_METHODS);
export const identityReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).optional(),
}).strict();

const REAL_NAME_RE = /^[\u3400-\u9fff·]{2,30}$/u;
const ID_RE = /^\d{17}[\dX]$/;
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECKSUM = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

export function normalizeChineseId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidChineseId(value: string): boolean {
  const id = normalizeChineseId(value);
  if (!ID_RE.test(id)) return false;
  const birth = id.slice(6, 14);
  const year = Number(birth.slice(0, 4));
  const month = Number(birth.slice(4, 6));
  const day = Number(birth.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const sum = ID_WEIGHTS.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
  return ID_CHECKSUM[sum % 11] === id[17];
}

export const realNameIdentitySchema = z.object({
  realName: z.string().trim().refine((value) => REAL_NAME_RE.test(value), "请输入真实中文姓名"),
  idNumber: z.string().transform(normalizeChineseId).refine(isValidChineseId, "身份证号格式或校验位错误"),
  privacyConfirmed: z.literal(true),
}).strict();

export function hashVerifiedIdentity(idNumber: string): string {
  return createHmac("sha256", getIdentityVerificationConfig().hmacKey).update(normalizeChineseId(idNumber)).digest("base64url");
}

export function encryptIdentityDetails(applicationId: string, realName: string, idNumber: string): EncryptedEnvelope {
  const config = getIdentityVerificationConfig();
  return encryptEnvelope(
    JSON.stringify({ realName: realName.trim(), idNumber: normalizeChineseId(idNumber) }),
    config.encryptionKey,
    config.keyVersion,
    `identity-application:${applicationId}`,
  );
}

export function decryptIdentityDetails(applicationId: string, envelope: EncryptedEnvelope): { realName: string; idNumber: string } {
  const config = getIdentityVerificationConfig(envelope.keyVersion);
  return JSON.parse(decryptEnvelope(envelope, config.encryptionKey, `identity-application:${applicationId}`));
}

export function maskChineseId(idNumber: string): string {
  return `${idNumber.slice(0, 6)}********${idNumber.slice(-4)}`;
}

export function sensitiveEvidenceKey(applicationId: string): string {
  const suffix = createHash("sha256").update(`${applicationId}:${randomUUID()}`).digest("hex");
  return `identity-verification/${applicationId}/${suffix}.webp`;
}

export function grantsStudentVerification(method: string): boolean {
  return PHOTO_METHODS.includes(method as (typeof PHOTO_METHODS)[number]);
}
