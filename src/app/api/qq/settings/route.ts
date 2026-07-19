import { Prisma } from "@prisma/client";

import { decryptQQIdentity } from "@/lib/qq-identity";
import { getQQConfig } from "@/lib/qq-config";
import { maskQQIdentity, qqNoStoreJson, qqRouteError } from "@/lib/qq-h5";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const identity = await prisma.qQIdentity.findUnique({
      where: { userId: request.user.id },
      select: { ciphertext: true, iv: true, authTag: true, keyVersion: true, createdAt: true },
    });
    if (!identity) return qqNoStoreJson({ bound: false });
    const qq = decryptQQIdentity(identity, getQQConfig().identityEncryptionKey);
    return qqNoStoreJson({ bound: true, maskedQQ: maskQQIdentity(qq), boundAt: identity.createdAt });
  } catch (error) {
    return qqRouteError(error);
  }
});

export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.qQIdentity.deleteMany({ where: { userId: request.user.id } });
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
          details: { source: "ACCOUNT_SETTINGS" },
        },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return qqNoStoreJson({ unbound: result });
  } catch (error) {
    return qqRouteError(error);
  }
});
