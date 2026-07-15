import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

/** Approved cases in which the current user is the submitter or a handler. */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const userId = req.user.id;
  const cases = await prisma.case.findMany({
    where: {
      requestStatus: "APPROVED",
      OR: [
        { submitterId: userId },
        { handlerId: userId },
        { handlers: { some: { userId } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      category: true,
      status: true,
      requestStatus: true,
      createdAt: true,
      updatedAt: true,
      submitter: { select: { nickname: true } },
    },
  });

  return NextResponse.json({ cases });
}, undefined, { captureAllTelemetry: true });
