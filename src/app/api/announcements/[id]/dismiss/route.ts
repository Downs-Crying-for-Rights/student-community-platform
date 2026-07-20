import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { announcementDismissSchema } from "@/lib/announcement";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const POST = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const parsed = announcementDismissSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "参数校验失败" }, { status: 400 });

  const announcement = await prisma.announcement.findUnique({
    where: { id: context.params.id },
    select: { id: true, revision: true, isPublished: true, forcePopup: true },
  });
  if (!announcement || !announcement.isPublished || !announcement.forcePopup) {
    return NextResponse.json({ error: "公告不存在" }, { status: 404 });
  }
  if (announcement.revision !== parsed.data.revision) {
    return NextResponse.json({ error: "公告已更新，请重新阅读", revision: announcement.revision }, { status: 409 });
  }

  await prisma.announcementReceipt.upsert({
    where: {
      announcementId_revision_userId: {
        announcementId: announcement.id,
        revision: announcement.revision,
        userId: req.user.id,
      },
    },
    update: { dismissedAt: new Date() },
    create: { announcementId: announcement.id, revision: announcement.revision, userId: req.user.id },
  });
  return NextResponse.json({ success: true });
});
