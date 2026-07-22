import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const statusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING");

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const status = statusSchema.safeParse(new URL(req.url).searchParams.get("status") || undefined);
  if (!status.success) return NextResponse.json({ error: "状态无效" }, { status: 400 });
  const requests = await prisma.identityVerificationRevocationRequest.findMany({
    where: { status: status.data }, orderBy: { requestedAt: "asc" }, take: 100,
    select: {
      id: true, scope: true, status: true, reason: true, reviewNote: true, requestedAt: true, reviewedAt: true,
      user: { select: { id: true, nickname: true, realVerifiedAt: true, studentVerifiedAt: true } },
      reviewer: { select: { id: true, nickname: true } },
    },
  });
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "private, no-store" } });
}, "ADMIN");
