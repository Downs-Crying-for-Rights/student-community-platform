import prisma from "@/lib/prisma";
import { getCurrentPunishmentStatus, getPendingAcknowledgements } from "@/lib/punishment-service";
import { noStoreJson } from "@/lib/support-ticket";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const [status, pending, active] = await Promise.all([
    getCurrentPunishmentStatus(req.user.id),
    getPendingAcknowledgements(req.user.id),
    prisma.userPunishment.findMany({
      where: { userId: req.user.id, action: "APPLIED", revokedAt: null, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { id: true, type: true, reason: true, startsAt: true, expiresAt: true }, orderBy: { createdAt: "desc" },
    }),
  ]);
  return noStoreJson({ status, pendingAcknowledgements: pending, activePunishments: active });
});
