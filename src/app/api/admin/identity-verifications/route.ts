import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const querySchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING");

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const status = querySchema.safeParse(new URL(req.url).searchParams.get("status") || undefined);
  if (!status.success) return NextResponse.json({ error: "状态无效" }, { status: 400 });
  const applications = await prisma.identityVerificationApplication.findMany({
    where: { status: status.data },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true, method: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true,
      evidenceKey: true, identityCiphertext: true,
      applicant: { select: { id: true, nickname: true, realVerifiedAt: true, studentVerifiedAt: true } },
      reviewer: { select: { id: true, nickname: true } },
    },
  });
  return NextResponse.json({
    applications: applications.map(({ evidenceKey, identityCiphertext, ...application }) => ({
      ...application,
      hasEvidence: Boolean(evidenceKey),
      hasIdentityDetails: Boolean(identityCiphertext),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}, "ADMIN");
