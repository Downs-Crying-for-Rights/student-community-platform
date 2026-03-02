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
      },
      orderBy: { createdAt: "desc" },
    });

    // For DCR-type applications, look up the most recent Case by applicantId
    const dcrApps = applications.filter((app) => app.type === "DCR");
    const applicantIds = [...new Set(dcrApps.map((app) => app.applicantId))];

    const caseMap = new Map<
      string,
      { formData: unknown; pledgeText: string; category: string; status: string }
    >();

    if (applicantIds.length > 0) {
      const cases = await prisma.case.findMany({
        where: { submitterId: { in: applicantIds } },
        select: {
          submitterId: true,
          formData: true,
          pledgeText: true,
          category: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Keep only the most recent Case per submitterId
      for (const c of cases) {
        if (!caseMap.has(c.submitterId)) {
          caseMap.set(c.submitterId, {
            formData: c.formData,
            pledgeText: c.pledgeText,
            category: c.category,
            status: c.status,
          });
        }
      }
    }

    const enrichedApplications = applications.map((app) => ({
      ...app,
      relatedCase: app.type === "DCR" ? (caseMap.get(app.applicantId) ?? null) : null,
    }));

    return NextResponse.json({ applications: enrichedApplications });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
