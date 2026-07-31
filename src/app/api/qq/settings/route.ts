import { Prisma } from "@prisma/client";

import { decryptQQIdentity, decryptQQOfficialIdentity } from "@/lib/qq-identity";
import { getQQConfig } from "@/lib/qq-config";
import { maskQQIdentity, qqNoStoreJson, qqRouteError } from "@/lib/qq-h5";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const [personal, official] = await Promise.all([
      prisma.qQIdentity.findUnique({
        where: { userId: request.user.id },
        select: { ciphertext: true, iv: true, authTag: true, keyVersion: true, createdAt: true },
      }),
      prisma.qQOfficialIdentity.findUnique({
        where: { userId: request.user.id },
        select: { ciphertext: true, iv: true, authTag: true, keyVersion: true, createdAt: true },
      }),
    ]);
    const key = getQQConfig().identityEncryptionKey;
    const personalStatus = personal
      ? { bound: true, maskedQQ: maskQQIdentity(decryptQQIdentity(personal, key)), boundAt: personal.createdAt }
      : { bound: false };
    const officialStatus = official
      ? { bound: true, maskedQQ: maskQQIdentity(decryptQQOfficialIdentity(official, key)), boundAt: official.createdAt }
      : { bound: false };
    return qqNoStoreJson({
      bound: personalStatus.bound || officialStatus.bound,
      personal: personalStatus,
      official: officialStatus,
    });
  } catch (error) {
    return qqRouteError(error);
  }
});

export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const provider = new URL(request.url).searchParams.get("provider");
    if (provider !== "personal" && provider !== "official") {
      return qqNoStoreJson({ error: "请选择要解绑的 QQ 机器人" }, { status: 400 });
    }
    const result = await prisma.$transaction(async (tx) => {
      const deleted = provider === "official"
        ? await tx.qQOfficialIdentity.deleteMany({ where: { userId: request.user.id } })
        : await tx.qQIdentity.deleteMany({ where: { userId: request.user.id } });
      if (deleted.count === 0) return false;
      await tx.user.update({
        where: { id: request.user.id },
        data: { securityVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          operatorId: request.user.id,
          action: "QQ_IDENTITY_UNBIND",
          targetType: "USER",
          targetId: request.user.id,
          details: { source: "ACCOUNT_SETTINGS", provider: provider === "official" ? "QQ_OFFICIAL" : "ONEBOT11" },
        },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return qqNoStoreJson({ unbound: result });
  } catch (error) {
    return qqRouteError(error);
  }
});
