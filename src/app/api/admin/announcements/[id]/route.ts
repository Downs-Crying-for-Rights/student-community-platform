import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { announcementUpdateSchema } from "@/lib/announcement";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";

export const PATCH = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsed = announcementUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });
  const existing = await prisma.announcement.findUnique({ where: { id: context.params.id } });
  if (!existing) return NextResponse.json({ error: "公告不存在" }, { status: 404 });

  if (parsed.data.title !== undefined || parsed.data.content !== undefined) {
    const matches = await scanContent(`${parsed.data.title ?? existing.title}\n${parsed.data.content ?? existing.content}`);
    if (matches.length > 0) return NextResponse.json({ error: "公告包含敏感信息" }, { status: 400 });
  }

  const contentChanged = parsed.data.title !== undefined || parsed.data.content !== undefined;
  const announcement = await prisma.$transaction(async (tx) => {
    if (parsed.data.forcePopup === true) {
      await tx.announcement.updateMany({
        where: { id: { not: existing.id }, forcePopup: true },
        data: { forcePopup: false },
      });
    }
    const updated = await tx.announcement.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        ...(contentChanged ? { revision: { increment: 1 } } : {}),
        ...(parsed.data.isPublished === true && !existing.isPublished ? { publishedAt: new Date() } : {}),
      },
    });
    await logAudit(req.user.id, AuditAction.ANNOUNCEMENT_UPDATE, AuditTargetType.ANNOUNCEMENT, existing.id, {
      updatedFields: Object.keys(parsed.data),
      revision: updated.revision,
    }, undefined, tx);
    return updated;
  });
  return NextResponse.json({ announcement });
}, "SUPER_ADMIN", { captureAllTelemetry: true });
