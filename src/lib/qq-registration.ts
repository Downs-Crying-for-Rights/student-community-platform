import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { getQQConfig } from "@/lib/qq-config";
import { buildQQGrantConsumeWhere, generateQQGrant, hashQQGrant } from "@/lib/qq-grants";
import type { QQBotIdentityProvider } from "@/lib/qq-bot-contract";
import {
  encryptQQIdentity,
  encryptQQOfficialIdentity,
  hashQQIdentity,
  hashQQOfficialIdentity,
} from "@/lib/qq-identity";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { runSerializableTransaction } from "@/lib/serializable-transaction";

const REGISTRATION_UNAVAILABLE = "注册凭据无效、已过期或已使用，请返回网站重新申请。";

export async function createPendingQQRegistration(username: string, password: string, agreementRevisions: Record<string, number>) {
  const config = getQQConfig();
  const token = generateQQGrant();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.grantTtlSeconds * 1_000);
  const passwordHash = await bcrypt.hash(password, 10);

  return runSerializableTransaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { username }, select: { id: true } });
    if (existingUser) return { ok: false as const, reason: "USERNAME_TAKEN" as const };

    const pending = await tx.pendingQQRegistration.findUnique({ where: { username } });
    if (pending && pending.expiresAt > now && !pending.consumedAt) {
      return { ok: false as const, reason: "REGISTRATION_PENDING" as const };
    }
    if (pending) await tx.pendingQQRegistration.delete({ where: { id: pending.id } });

    const created = await tx.pendingQQRegistration.create({
      data: { username, passwordHash, agreementRevisions, expiresAt },
    });
    await tx.qQGrant.create({
      data: {
        tokenHash: hashQQGrant(token, config.grantHmacKey),
        purpose: "REGISTRATION_FINALIZE",
        pendingRegistrationId: created.id,
        expiresAt,
      },
    });
    return { ok: true as const, credential: token, expiresAt };
  });
}

export async function getQQRegistrationStatus(credential: string) {
  const config = getQQConfig();
  const grant = await prisma.qQGrant.findUnique({
    where: { tokenHash: hashQQGrant(credential, config.grantHmacKey) },
    select: { purpose: true, expiresAt: true, consumedAt: true, pendingRegistration: { select: { consumedAt: true } } },
  });
  if (!grant || grant.purpose !== "REGISTRATION_FINALIZE") return "EXPIRED" as const;
  if (grant.consumedAt && grant.pendingRegistration?.consumedAt) return "COMPLETED" as const;
  if (grant.expiresAt <= new Date()) return "EXPIRED" as const;
  return "PENDING" as const;
}

export async function finalizeQQRegistration(
  tx: Prisma.TransactionClient,
  credential: string | undefined,
  qq: string,
  provider: QQBotIdentityProvider = "ONEBOT11",
): Promise<string> {
  if (!credential) return REGISTRATION_UNAVAILABLE;
  const config = getQQConfig();
  let tokenHash: string;
  try {
    tokenHash = hashQQGrant(credential, config.grantHmacKey);
  } catch {
    return REGISTRATION_UNAVAILABLE;
  }

  const now = new Date();
  const grant = await tx.qQGrant.findFirst({
    where: buildQQGrantConsumeWhere(tokenHash, "REGISTRATION_FINALIZE", now),
    include: { pendingRegistration: true },
  });
  const pending = grant?.pendingRegistration;
  if (!grant || !pending?.passwordHash || pending.consumedAt || pending.expiresAt <= now) return REGISTRATION_UNAVAILABLE;

  const lookupHash = provider === "QQ_OFFICIAL"
    ? hashQQOfficialIdentity(qq, config.identityHmacKey)
    : hashQQIdentity(qq, config.identityHmacKey);
  const [existingIdentity, existingUser] = await Promise.all([
    provider === "QQ_OFFICIAL"
      ? tx.qQOfficialIdentity.findUnique({ where: { lookupHash }, select: { id: true } })
      : tx.qQIdentity.findUnique({ where: { lookupHash }, select: { id: true } }),
    tx.user.findUnique({ where: { username: pending.username }, select: { id: true } }),
  ]);
  if (existingIdentity) return "此 QQ 已绑定账号，无法用于注册新账号。";
  if (existingUser) return "用户名已被占用，请返回网站更换用户名后重试。";

  const consumed = await tx.qQGrant.updateMany({
    where: { ...buildQQGrantConsumeWhere(tokenHash, "REGISTRATION_FINALIZE", now), pendingRegistrationId: pending.id },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return REGISTRATION_UNAVAILABLE;

  const user = await tx.user.create({
    data: {
      username: pending.username,
      nickname: pending.username,
      passwordHash: pending.passwordHash,
      profileCompletionRequired: false,
    },
  });
  const encrypted = provider === "QQ_OFFICIAL"
    ? encryptQQOfficialIdentity(qq, config.identityEncryptionKey, config.keyVersion)
    : encryptQQIdentity(qq, config.identityEncryptionKey, config.keyVersion);
  const identityData = {
    userId: user.id,
    lookupHash,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
  };
  if (provider === "QQ_OFFICIAL") {
    await tx.qQOfficialIdentity.create({ data: identityData });
  } else {
    await tx.qQIdentity.create({ data: identityData });
  }
  await tx.pendingQQRegistration.update({
    where: { id: pending.id },
    data: { consumedAt: now, passwordHash: null, userId: user.id },
  });
  await tx.qQGrant.update({ where: { id: grant.id }, data: { userId: user.id } });
  await tx.auditLog.create({
    data: { action: "QQ_REGISTRATION_COMPLETE", targetType: "User", targetId: user.id, operatorId: user.id, details: {
      method: provider === "QQ_OFFICIAL" ? "official_qq_bot" : "personal_qq_bot",
      agreementRevisions: pending.agreementRevisions,
      acceptedAt: pending.createdAt,
    } },
  });
  return "注册成功。请返回网站使用用户名和密码登录；进入 DCR 前仍需验证手机号。";
}

export async function allowQQRegistrationAttempt(lookupHash: string): Promise<boolean> {
  const result = await redis.eval(
    `local sender = redis.call("INCR", KEYS[1])
     if sender == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
     if sender > tonumber(ARGV[2]) then return 0 end
     local global = redis.call("INCR", KEYS[2])
     if global == 1 then redis.call("EXPIRE", KEYS[2], ARGV[1]) end
     if global > tonumber(ARGV[3]) then return 0 end
     return 1`,
    2,
    `qq-register:attempt:${lookupHash}`,
    "qq-register:attempt:global",
    "900",
    "10",
    "300",
  );
  return result === 1;
}

export async function claimQQRegistrationRateLimit(
  scope: "issue" | "status",
  firstKey: string,
  secondKey: string,
  firstLimit: number,
  secondLimit: number,
): Promise<boolean> {
  const result = await redis.eval(
    `local first = redis.call("INCR", KEYS[1])
     if first == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
     local second = redis.call("INCR", KEYS[2])
     if second == 1 then redis.call("EXPIRE", KEYS[2], ARGV[1]) end
     if first > tonumber(ARGV[2]) or second > tonumber(ARGV[3]) then return 0 end
     return 1`,
    2,
    `qq-register:${scope}:${firstKey}`,
    `qq-register:${scope}:${secondKey}`,
    "900",
    String(firstLimit),
    String(secondLimit),
  );
  return result === 1;
}
