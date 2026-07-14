import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const chapters = await prisma.dcrTutorialChapter.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, title: true, content: true, order: true },
  });
  return NextResponse.json({ chapters });
});
