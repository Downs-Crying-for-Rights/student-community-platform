import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { noStoreJson, supportMessageSelect, supportTicketSelect } from "@/lib/support-ticket";

export const GET = withAuth(async (req: AuthenticatedRequest, { params }) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, requesterId: req.user.id },
    select: {
      ...supportTicketSelect,
      messages: { select: supportMessageSelect, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return noStoreJson({ error: "工单不存在" }, { status: 404 });
  return noStoreJson({ ticket });
});
