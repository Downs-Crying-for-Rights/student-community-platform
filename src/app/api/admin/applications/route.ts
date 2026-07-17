import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const querySchema = z.object({
  type: z.enum(["DCR", "PSYCHOLOGY"]).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, status } = parsed.data;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const applications = await prisma.accessApplication.findMany({
      where,
      include: {
        applicant: { select: { id: true, nickname: true } },
        case_: {
          select: {
            id: true,
            formData: true,
            pledgeText: true,
            category: true,
            status: true,
            requestStatus: true,
            reviewNote: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enrichedApplications = applications.map(({ case_: relatedCase, ...app }) => ({
      ...app,
      relatedCase: app.type === "DCR" ? relatedCase : null,
      caseLinkMissing: app.type === "DCR" && relatedCase === null,
    }));

    return NextResponse.json({ applications: enrichedApplications });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
