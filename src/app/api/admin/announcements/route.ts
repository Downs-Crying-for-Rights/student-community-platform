import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { announcementSchema } from "@/lib/announcement";
import { queueAnnouncementDeliveries, processAnnouncementDeliveries } from "@/lib/announcement-delivery";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";

export const GET = withAuth(async () => {
  const [announcements, deliveryCounts] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { receipts: true, deliveries: true } } },
    }),
    prisma.announcementDelivery.groupBy({
      by: ["announcementId", "status"],
      _count: { _all: true },
    }),
  ]);
  return NextResponse.json({
    announcements: announcements.map((announcement) => ({
      ...announcement,
      deliveredCount: deliveryCounts.find((count) => count.announcementId === announcement.id && count.status === "DELIVERED")?._count._all ?? 0,
      failedCount: deliveryCounts.find((count) => count.announcementId === announcement.id && count.status === "FAILED")?._count._all ?? 0,
    })),
  });
}, "SUPER_ADMIN", { captureAllTelemetry: true });

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = announcementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const matches = await scanContent(`${parsed.data.title}\n${parsed.data.content}`);
  if (matches.length > 0) {
    return NextResponse.json({ error: "公告包含敏感信息，请修改后重试", hitCount: matches.length }, { status: 400 });
  }

  const announcement = await prisma.$transaction(async (tx) => {
    if (parsed.data.forcePopup) {
      await tx.announcement.updateMany({ where: { forcePopup: true }, data: { forcePopup: false } });
    }
    const created = await tx.announcement.create({
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        forcePopup: parsed.data.forcePopup,
        createdById: req.user.id,
      },
    });
    await logAudit(req.user.id, AuditAction.ANNOUNCEMENT_CREATE, AuditTargetType.ANNOUNCEMENT, created.id, {
      forcePopup: created.forcePopup,
      sendDm: parsed.data.sendDm,
    }, undefined, tx);
    return created;
  });

  let broadcast = null;
  if (parsed.data.sendDm) {
    const queued = await queueAnnouncementDeliveries(announcement.id);
    const processed = await processAnnouncementDeliveries(announcement.id);
    broadcast = { ...queued, ...processed };
    if (processed.remaining === 0) {
      await logAudit(req.user.id, AuditAction.ANNOUNCEMENT_BROADCAST, AuditTargetType.ANNOUNCEMENT, announcement.id, broadcast);
    }
  }

  return NextResponse.json({ announcement, broadcast }, { status: 201 });
}, "SUPER_ADMIN", { captureAllTelemetry: true });
