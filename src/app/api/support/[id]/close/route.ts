import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { asNextResponse, noStoreJson } from "@/lib/support-ticket";

export const POST = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const limited = await enforceRateLimit(`support:close:${req.user.id}`, 10, 10 * 60 * 1000);
  if (limited) return asNextResponse(limited.response);

  const result = await prisma.supportTicket.updateMany({
    where: { id: params.id, requesterId: req.user.id, kind: "GENERAL", status: { not: "CLOSED" } },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.supportTicket.count({
      where: { id: params.id, requesterId: req.user.id, kind: "GENERAL" },
    });
    return exists
      ? noStoreJson({ ok: true })
      : noStoreJson({ error: "工单不存在" }, { status: 404 });
  }
  return noStoreJson({ ok: true });
});
