import type { Prisma, UserPunishment, UserPunishmentType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/serializable-transaction";
import {
  isBanPunishment,
  isMutePunishment,
  isTemporaryPunishment,
  requiresAcknowledgement,
  type StructuredPunishmentType,
} from "@/lib/punishment-policy";

type Db = Prisma.TransactionClient | typeof prisma;
type ProjectionRecord = Pick<UserPunishment, "id" | "type" | "action" | "startsAt" | "expiresAt" | "revokedAt" | "createdAt">;

function activeLegacyTypes(records: ProjectionRecord[]): Set<UserPunishmentType> {
  const active = new Set<UserPunishmentType>();
  for (const type of ["ACCOUNT_BAN", "POST_SHADOW_HIDE"] as const) {
    const latest = records.filter((record) => record.type === type).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latest?.action === "APPLIED" && !latest.revokedAt) active.add(type);
  }
  return active;
}

export function calculatePunishmentProjection(records: ProjectionRecord[], now = new Date()) {
  const legacy = activeLegacyTypes(records);
  const active = records.filter((record) => {
    if (record.action !== "APPLIED" || record.revokedAt || record.startsAt > now) return false;
    if (record.expiresAt && record.expiresAt <= now) return false;
    if (record.type === "ACCOUNT_BAN" || record.type === "POST_SHADOW_HIDE") return legacy.has(record.type);
    return true;
  });
  const mutes = active.filter((record) => isMutePunishment(record.type));
  const bans = active.filter((record) => isBanPunishment(record.type));
  const latestExpiry = (items: ProjectionRecord[]) => items.some((item) => !item.expiresAt)
    ? null
    : items.reduce<Date | null>((latest, item) => !latest || item.expiresAt! > latest ? item.expiresAt : latest, null);
  return {
    active,
    isMuted: mutes.length > 0,
    muteUntil: latestExpiry(mutes),
    isBanned: bans.length > 0,
    banUntil: latestExpiry(bans),
    isShadowBanned: active.some((record) => record.type === "POST_SHADOW_HIDE"),
  };
}

export async function recalculatePunishmentProjection(userId: string, db: Db = prisma, now = new Date()) {
  if ("$queryRaw" in db) {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`punishment-projection:${userId}`}))`;
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } });
  if (!user) throw new Error("USER_NOT_FOUND");
  const records = await db.userPunishment.findMany({
    where: { userId },
    select: { id: true, type: true, action: true, startsAt: true, expiresAt: true, revokedAt: true, createdAt: true },
  });
  const projection = calculatePunishmentProjection(records, now);
  return db.user.update({
    where: { id: userId },
    data: {
      isMuted: user.deactivatedAt ? false : projection.isMuted,
      muteUntil: user.deactivatedAt ? null : projection.muteUntil,
      isBanned: user.deactivatedAt ? true : projection.isBanned,
      banUntil: user.deactivatedAt ? null : projection.banUntil,
      isShadowBanned: user.deactivatedAt ? false : projection.isShadowBanned,
      securityVersion: { increment: 1 },
    },
    select: { id: true, isMuted: true, muteUntil: true, isBanned: true, banUntil: true, isShadowBanned: true },
  });
}

export async function applyPunishment(input: {
  userId: string;
  operatorId: string;
  type: StructuredPunishmentType | "ACCOUNT_BAN" | "POST_SHADOW_HIDE";
  reason: string;
  expiresAt?: Date | null;
  details?: Prisma.InputJsonValue;
}, db?: Db) {
  const run = async (tx: Db) => {
    const now = new Date();
    const expiresAt = input.expiresAt ?? null;
    if (isTemporaryPunishment(input.type) && (!expiresAt || expiresAt <= now)) throw new Error("INVALID_PUNISHMENT_EXPIRY");
    if (!isTemporaryPunishment(input.type) && expiresAt) throw new Error("UNEXPECTED_PUNISHMENT_EXPIRY");
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { role: true, isBanned: true, deactivatedAt: true },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.deactivatedAt) throw new Error("ACCOUNT_DEACTIVATED");
    if (isBanPunishment(input.type) && target.role === "SUPER_ADMIN" && !target.isBanned) {
      const activeSuperAdmins = await tx.user.count({
        where: { role: "SUPER_ADMIN", isBanned: false, deactivatedAt: null },
      });
      if (activeSuperAdmins <= 1) throw new Error("LAST_ACTIVE_SUPER_ADMIN");
    }
    const punishment = await tx.userPunishment.create({
      data: { ...input, startsAt: now, expiresAt, action: "APPLIED" },
    });
    await recalculatePunishmentProjection(input.userId, tx, now);
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: "SYSTEM",
        title: "账户处罚通知",
        content: `平台已对你的账户执行处罚。原因：${input.reason}`,
        link: "/support",
      },
    });
    return punishment;
  };
  return db ? run(db) : runSerializableTransaction(run);
}

export async function revokePunishment(input: { punishmentId: string; operatorId: string; reason: string }, db?: Db) {
  const run = async (tx: Db) => {
    const existing = await tx.userPunishment.findUnique({ where: { id: input.punishmentId } });
    if (!existing || existing.action !== "APPLIED") throw new Error("PUNISHMENT_NOT_FOUND");
    if (existing.revokedAt) throw new Error("PUNISHMENT_ALREADY_REVOKED");
    const punishment = await tx.userPunishment.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedById: input.operatorId, revokeReason: input.reason },
    });
    await recalculatePunishmentProjection(existing.userId, tx);
    await tx.notification.create({
      data: { userId: existing.userId, type: "SYSTEM", title: "账户处罚已解除", content: `处罚已解除。说明：${input.reason}`, link: "/support" },
    });
    return punishment;
  };
  return db ? run(db) : runSerializableTransaction(run);
}

export async function getCurrentPunishmentStatus(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isMuted: true, muteUntil: true, isBanned: true, banUntil: true, deactivatedAt: true },
  });
  if (!user) return null;
  if (user.deactivatedAt) {
    if (!user.isBanned || user.banUntil || user.isMuted || user.muteUntil) {
      return recalculatePunishmentProjection(userId, prisma, now);
    }
    return user;
  }
  if ((user.isMuted && user.muteUntil && user.muteUntil <= now) || (user.isBanned && user.banUntil && user.banUntil <= now)) {
    return recalculatePunishmentProjection(userId, prisma, now);
  }
  return user;
}

export async function getPendingAcknowledgements(userId: string, now = new Date()) {
  return prisma.userPunishment.findMany({
    where: {
      userId,
      action: "APPLIED",
      revokedAt: null,
      acknowledgedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      type: { in: ["WARNING", "TEMPORARY_MUTE", "PERMANENT_MUTE"] },
    },
    select: { id: true, type: true, reason: true, startsAt: true, expiresAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export function canAppealPunishment(punishment: Pick<UserPunishment, "type" | "action" | "revokedAt" | "expiresAt">, now = new Date()) {
  return punishment.action === "APPLIED" && !punishment.revokedAt && (!punishment.expiresAt || punishment.expiresAt > now);
}

export function canAcknowledgePunishment(punishment: Pick<UserPunishment, "type" | "action" | "revokedAt">) {
  return punishment.action === "APPLIED" && !punishment.revokedAt && requiresAcknowledgement(punishment.type);
}
