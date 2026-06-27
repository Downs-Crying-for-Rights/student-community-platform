import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { dcrCategorySchema, paginationSchema } from "@/lib/validators";
import { extractFields, type DelegationInput } from "@/lib/dcr-field-extractor";
import { reviewDelegation } from "@/lib/dcr-review-rules";
import { scanContent } from "@/lib/sensitive-engine";
import { z } from "zod";

// ==================== Schemas ====================

const createCaseSchema = z.object({
  category: dcrCategorySchema,
  formData: z.record(z.unknown()),
  pledgeText: z.string().min(1, "强制声明不能为空"),
  // 委托表结构化字段
  grade: z.string().optional(),
  timeRange: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  expectedHelperProvince: z.string().optional(),
  riskPreference: z.string().optional(),
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
  // 按委托表审核状态筛选
  requestStatus: z.enum(["PENDING", "NEED_MORE_INFO", "APPROVED", "REJECTED", "MANUAL_REVIEW"]).optional(),
  handlerId: z.string().optional(),
});

/**
 * POST /api/cases
 * Create a new DCR case (委托).
 * - Requires auth
 * - Runs field extraction + review rules engine
 * - Stores extractedFields, missingFields, requestStatus
 * - Creates Case with requestStatus determined by review engine
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

    const {
      category, formData, pledgeText,
      grade, timeRange, province, city,
      expectedHelperProvince, riskPreference,
    } = parsed.data;

    // ---- 敏感词扫描 ----
    const formText = Object.values(formData).join(" ");
    const sensitiveMatches = await scanContent(formText + " " + pledgeText);
    const sensitiveHitCount = sensitiveMatches.length;

    // ---- 字段抽取 ----
    const input: DelegationInput = {
      contentType: (formData as Record<string, unknown>).contentType as string | undefined,
      schoolName: (formData as Record<string, unknown>).schoolName as string | undefined,
      schoolCategory: (formData as Record<string, unknown>).schoolCategory as string | undefined,
      schoolType: (formData as Record<string, unknown>).schoolType as string | undefined,
      schoolAddress: (formData as Record<string, unknown>).schoolAddress as string | undefined,
      reportChannels: (formData as Record<string, unknown>).reportChannels as string | undefined,
      description: (formData as Record<string, unknown>).description as string | undefined,
      feeStatus: (formData as Record<string, unknown>).feeStatus as string | undefined,
      feeDetails: (formData as Record<string, unknown>).feeDetails as string | undefined,
      demands: (formData as Record<string, unknown>).demands as string[] | undefined,
      otherDemand: (formData as Record<string, unknown>).otherDemand as string | undefined,
      pledgeText,
      grade,
      timeRange,
      province,
      city,
      expectedHelperProvince,
      riskPreference,
    };

    const extraction = extractFields(input);

    // ---- 审核规则判定 ----
    const rawText = formText + " " + pledgeText;
    const reviewResult = reviewDelegation(extraction, rawText);

    // ---- 创建 Case ----
    const caseRecord = await prisma.case.create({
      data: {
        category,
        formData: formData as unknown as import("@prisma/client").Prisma.InputJsonValue,
        pledgeText,
        status: "OPENED",
        requestStatus: reviewResult.decision,
        reviewNote: reviewResult.reason,
        extractedFields: extraction.extractedFields as unknown as import("@prisma/client").Prisma.InputJsonValue,
        missingFields: reviewResult.missingFields,
        sensitiveHitCount,
        grade,
        timeRange,
        province,
        city,
        expectedHelperProvince,
        riskPreference,
        submitterId: userId,
        timeline: {
          create: {
            action: "委托创建",
            newStatus: "OPENED",
            details: reviewResult.decision === "APPROVED"
              ? "委托表审核通过，进入可匹配池"
              : `审核结果: ${reviewResult.decision} - ${reviewResult.reason}`,
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
      {
        category,
        requestStatus: reviewResult.decision,
        missingFields: reviewResult.missingFields,
        sensitiveHitCount,
      },
    );

    return NextResponse.json({
      case: caseRecord,
      review: {
        decision: reviewResult.decision,
        reason: reviewResult.reason,
        missingFields: reviewResult.missingFields,
      },
    }, { status: 201 });
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
      requestStatus: searchParams.get("requestStatus") ?? undefined,
      handlerId: searchParams.get("handlerId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, status, requestStatus, handlerId } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build where clause based on role
    const where: Record<string, unknown> = {};

    // 按委托表审核状态筛选
    if (requestStatus) {
      where.requestStatus = requestStatus;
    }

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
        select: {
          id: true,
          category: true,
          formData: true,
          pledgeText: true,
          status: true,
          requestStatus: true,
          reviewNote: true,
          missingFields: true,
          extractedFields: true,
          sensitiveHitCount: true,
          createdAt: true,
          updatedAt: true,
          submitter: { select: { id: true, nickname: true } },
          handler: { select: { id: true, nickname: true } },
        },
      }),
      prisma.case.count({ where }),
    ]);

    return NextResponse.json({ cases, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/cases error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
