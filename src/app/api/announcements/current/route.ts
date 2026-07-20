import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withOptionalAuth, type OptionalAuthRequest } from "@/lib/rbac";

export const GET = withOptionalAuth(async (req: OptionalAuthRequest) => {
  const announcement = await prisma.announcement.findFirst({
    where: { isPublished: true, forcePopup: true },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, content: true, revision: true, publishedAt: true },
  });

  if (!announcement) {
    return NextResponse.json({ announcement: null }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (req.user) {
    const receipt = await prisma.announcementReceipt.findUnique({
      where: {
        announcementId_revision_userId: {
          announcementId: announcement.id,
          revision: announcement.revision,
          userId: req.user.id,
        },
      },
      select: { id: true },
    });
    if (receipt) {
      return NextResponse.json({ announcement: null }, { headers: { "Cache-Control": "private, no-store" } });
    }
  }

  return NextResponse.json({ announcement }, { headers: { "Cache-Control": "private, no-store" } });
});
