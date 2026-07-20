import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { processAnnouncementDeliveries } from "@/lib/announcement-delivery";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const POST = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const announcement = await prisma.announcement.findUnique({
    where: { id: context.params.id },
    select: { id: true },
  });
  if (!announcement) return NextResponse.json({ error: "公告不存在" }, { status: 404 });

  const result = await processAnnouncementDeliveries(announcement.id);
  if (result.remaining === 0) {
    await logAudit(req.user.id, AuditAction.ANNOUNCEMENT_BROADCAST, AuditTargetType.ANNOUNCEMENT, announcement.id, result);
  }
  return NextResponse.json(result);
}, "SUPER_ADMIN", { captureAllTelemetry: true });
