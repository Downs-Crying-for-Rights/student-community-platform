import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { isSupportStatus, noStoreJson, supportTicketSelect, type SupportStatus } from "@/lib/support-ticket";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status && status !== "ALL" && !isSupportStatus(status)) {
    return noStoreJson({ error: "状态参数无效" }, { status: 400 });
  }
  const where = {
    ...(status && status !== "ALL" ? { status: status as SupportStatus } : {}),
  };
  const [tickets, assignees] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: {
        ...supportTicketSelect,
        requester: { select: { id: true, nickname: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, nickname: true },
      orderBy: { nickname: "asc" },
    }),
  ]);
  return noStoreJson({ tickets, assignees });
}, "ADMIN");
