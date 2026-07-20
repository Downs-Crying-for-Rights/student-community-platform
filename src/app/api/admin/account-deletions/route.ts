import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { withAuth } from "@/lib/rbac";

export const GET = withAuth(async () => {
  const requests = await prisma.accountDeletionRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    take: 100,
    include: { user: { select: { id: true, nickname: true, email: true, role: true, createdAt: true } } },
  });
  return NextResponse.json({ requests });
}, "ADMIN");
