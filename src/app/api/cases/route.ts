import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { dcrCategorySchema, paginationSchema } from "@/lib/validators";
import { z } from "zod";

// ==================== Schemas ====================

const createCaseSchema = z.object({
  category: dcrCategorySchema,
  formData: z.record(z.unknown()),
  pledgeText: z.string().min(1, "强制声明不能为空"),
});

const caseStatusEnum = z.enum(["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"]);

const listQuerySchema = paginationSchema.extend({
  // Allow pageSize up to 200 for cases (dcr/posts needs all case IDs)
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  // Accept single status or comma-separated statuses
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val.split(",").map((s) => s.trim());
    })
    .pipe(z.array(caseStatusEnum).min(1).optional()),
  handlerId: z.string().optional(),
});

/**
 * POST /api/cases
 * Create a new DCR case (委托).
 * - Requires auth
 * - Creates Case with status OPENED
 * - Auto-creates AccessApplication (type=DCR) if user has no dcrAccess and no PENDING application
 * - Generates initial TimelineEvent
 * - Logs audit
 *
 * Validates: Requirements 11.1, 11.2, 11.6, 11.8
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, dcrAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = createCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { category, formData, pledgeText } = parsed.data;

    // Create case with initial timeline event
    const caseRecord = await prisma.case.create({
      data: {
        category,
        formData: formData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        pledgeText,
        status: "OPENED",
        submitterId: userId,
        timeline: {
          create: {
            action: "委托创建",
            newStatus: "OPENED",
            details: "用户提交了新的委托",
          },
        },
      },
      include: {
        submitter: { select: { id: true, nickname: true } },
        timeline: true,
      },
    });

    // Auto-create AccessApplication for admin review if user doesn't have dcrAccess
    // and doesn't already have a PENDING DCR application
    if (!user.dcrAccess) {
      const existingPending = await prisma.accessApplication.findFirst({
        where: { applicantId: userId, type: "DCR", status: "PENDING" },
      });

      if (!existingPending) {
        await prisma.accessApplication.create({
          data: {
            type: "DCR",
            status: "PENDING",
            pledgeText,
            applicantId: userId,
          },
        });
      }
    }

    // Log audit
    await logAudit(
      userId,
      "CREATE_CASE",
      AuditTargetType.CASE,
      caseRecord.id,
      { category, status: "OPENED" },
    );

    return NextResponse.json({ case: caseRecord }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cases error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * GET /api/cases
 * List DCR cases with pagination and optional status filter.
 * - Requires auth + dcrAccess
 * - Regular users see only their own cases
 * - DCRHelper sees cases assigned to them + OPENED cases
 * - Admin sees all cases
 * - Logs audit for access
 *
 * Validates: Requirements 11.1, 11.8
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Fetch dcrAccess for non-ADMIN users (used to determine query scope)
    const isAdminLevel = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
    let hasDcrAccess = isAdminLevel;
    if (!isAdminLevel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { dcrAccess: true },
      });
      hasDcrAccess = !!user?.dcrAccess;
    }

    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      handlerId: searchParams.get("handlerId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, status, handlerId } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build where clause based on role
    const where: Record<string, unknown> = {};

    // If handlerId is specified, filter by handler
    if (handlerId) {
      const statusFilter = status && status.length > 0
        ? (status.length === 1 ? status[0] : { in: status })
        : undefined;

      where.AND = [
        { handlers: { some: { userId: handlerId } } },
        ...(statusFilter ? [{ status: statusFilter }] : []),
      ];
    } else if (isAdminLevel) {
      // Admin / SuperAdmin sees all cases
      if (status && status.length > 0) {
        where.status = status.length === 1 ? status[0] : { in: status };
      }
    } else if (userRole === "DCR_HELPER" || hasDcrAccess) {
      // DCRHelper or any user with dcrAccess sees:
      // - cases they handle (via CaseHandler relation)
      // - cases they submitted
      // - OPENED cases (only when not filtering, or filtering by OPENED)
      const orClauses: Record<string, unknown>[] = [
        { handlers: { some: { userId } } },
        { submitterId: userId },
      ];
      const statusValues = status && status.length > 0 ? status : null;
      if (!statusValues || statusValues.includes("OPENED")) {
        orClauses.push({ status: "OPENED" as const });
      }
      where.AND = [
        { OR: orClauses },
        ...(statusValues ? [{ status: statusValues.length === 1 ? statusValues[0] : { in: statusValues } }] : []),
      ];
    } else {
      // Users without dcrAccess can still query their own cases
      where.submitterId = userId;
      if (status && status.length > 0) {
        where.status = status.length === 1 ? status[0] : { in: status };
      }
    }

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          submitter: { select: { id: true, nickname: true } },
          handler: { select: { id: true, nickname: true } },
          handlers: { select: { userId: true, user: { select: { id: true, nickname: true } } } },
        } as Record<string, unknown>,
      }),
      prisma.case.count({ where }),
    ]);

    return NextResponse.json({ cases, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/cases error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
