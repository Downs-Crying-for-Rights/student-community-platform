import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { canonicalCaseRequestSchema, paginationSchema } from "@/lib/validators";
import { extractFields, type DelegationInput } from "@/lib/dcr-field-extractor";
import { reviewDelegation } from "@/lib/dcr-review-rules";
import { scanContent } from "@/lib/sensitive-engine";
import { prepareCanonicalDelegation } from "@/lib/dcr-delegation-types";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";
import { sendAdminActionMail } from "@/lib/mail";
import { canSubmitDcrDelegation } from "@/lib/dcr-capabilities";
import { reconcileRejectedDcrApplications } from "@/lib/dcr-application-reconciliation";

// ==================== Schemas ====================

class DcrAdmissionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly next?: string,
  ) {
    super(message);
    this.name = "DcrAdmissionError";
  }
}

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
 * - New cases always enter PENDING for explicit admin review
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
      select: { id: true, role: true, dcrAccess: true, dcrContributionAccess: true, phone: true, quizPassed: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const hasDelegationCapability = canSubmitDcrDelegation(user);
    if (!hasDelegationCapability && !user.phone) {
      return NextResponse.json(
        { error: "提交 DCR 委托前请先完成手机号验证", next: "/bindphone?callbackUrl=/dcr/delegate" },
        { status: 403 },
      );
    }

    if (!hasDelegationCapability && !user.quizPassed) {
      return NextResponse.json(
        { error: "提交 DCR 委托前请先完成入频考核", next: "/dcr/quiz" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = canonicalCaseRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { category } = parsed.data;
    const {
      formData, pledgeText, grade, timeRange, province, city,
      expectedHelperProvince, riskPreference,
    } = prepareCanonicalDelegation(parsed.data.formData);

    // ---- 敏感词扫描 ----
    const formText = Object.values(parsed.data.formData).join(" ");
    let sensitiveMatches;
    try {
      sensitiveMatches = await scanContent(formText + " " + pledgeText);
    } catch (error) {
      console.error("POST /api/cases sensitive scan error:", error);
      return NextResponse.json(
        { error: "内容安全检查暂时不可用，请稍后重试", code: "SENSITIVE_SCAN_FAILED" },
        { status: 503 },
      );
    }
    if (sensitiveMatches.length > 0) {
      return NextResponse.json(
        { error: "委托内容包含敏感或可识别信息，请修改后重试", code: "SENSITIVE_CONTENT" },
        { status: 422 },
      );
    }
    const sensitiveHitCount = 0;

    // ---- 字段抽取 ----
    const input: DelegationInput = {
      ...formData,
      pledgeText,
      grade,
      timeRange,
      province,
      city,
      expectedHelperProvince,
      riskPreference,
    };

    const extraction = extractFields(input);

    // ---- 自动规则仅生成管理员审核建议，不直接批准或驳回 ----
    const rawText = formText + " " + pledgeText;
    const reviewResult = reviewDelegation(extraction, rawText);

    // ---- 创建 Case，并把首次准入申请原子地绑定到该 Case ----
    const caseRecord = await prisma.$transaction(async (tx) => {
      let hasOtherPendingApplication = false;
      if (!user.dcrAccess) {
        await reconcileRejectedDcrApplications(tx, userId);
        hasOtherPendingApplication = Boolean(await tx.accessApplication.findFirst({
          where: { applicantId: userId, type: "DCR", status: "PENDING" },
          select: { id: true },
        }));
      }

      const admissionDecision = hasDelegationCapability ? { allowed: true as const } : evaluateDcrAdmission({
        stage: "SUBMIT_CASE",
        user: {
          id: user.id,
          phone: user.phone,
          quizPassed: user.quizPassed,
          dcrAccess: user.dcrAccess,
        },
        hasOtherPendingApplication,
      });

      if (!admissionDecision.allowed) {
        throw new DcrAdmissionError(
          admissionDecision.code,
          admissionDecision.reason,
          admissionDecision.next,
        );
      }

      const createdCase = await tx.case.create({
        data: {
          category,
          formData: formData as unknown as Prisma.InputJsonValue,
          pledgeText,
          status: "OPENED",
          requestStatus: "PENDING",
          reviewNote: "委托已提交，正在等待管理员审核",
          extractedFields: extraction.extractedFields as unknown as Prisma.InputJsonValue,
          missingFields: extraction.missingFields,
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
              details: "委托已提交，正在等待管理员审核；审核通过前仅提交者和管理员可见",
            },
          },
        },
        include: {
          submitter: { select: { id: true, nickname: true } },
          timeline: true,
        },
      });

      if (!user.dcrAccess && !user.dcrContributionAccess) {
        const createApplicationDecision = evaluateDcrAdmission({
          stage: "CREATE_APPLICATION",
          user: {
            id: user.id,
            phone: user.phone,
            quizPassed: user.quizPassed,
            dcrAccess: user.dcrAccess,
          },
          case: {
            id: createdCase.id,
            submitterId: user.id,
            requestStatus: "PENDING",
          },
          hasOtherPendingApplication: false,
        });

        if (!createApplicationDecision.allowed) {
          throw new DcrAdmissionError(
            createApplicationDecision.code,
            createApplicationDecision.reason,
            createApplicationDecision.next,
          );
        }

        await tx.accessApplication.create({
          data: {
            type: "DCR",
            status: "PENDING",
            pledgeText,
            applicantId: userId,
            caseId: createdCase.id,
          },
        });
      }

      return createdCase;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    // Log audit
    await logAudit(
      userId,
      "CREATE_CASE",
      AuditTargetType.CASE,
      caseRecord.id,
      {
        category,
        requestStatus: "PENDING",
        automatedSuggestion: reviewResult.decision,
        automatedReason: reviewResult.reason,
        missingFields: reviewResult.missingFields,
        sensitiveHitCount,
      },
    );

    await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新委托待审核",
      text: `收到新的 DCR 委托，分类：${category}，系统建议：${reviewResult.decision}。`,
      actionUrl: "/admin/dcr/reviews?requestStatus=PENDING",
    });

    return NextResponse.json({
      case: caseRecord,
      review: {
        decision: "PENDING",
        reason: "委托已提交，正在等待管理员审核",
        missingFields: extraction.missingFields,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof DcrAdmissionError) {
      return NextResponse.json(
        { error: error.message, code: error.code, next: error.next },
        { status: error.code === "APPLICATION_ALREADY_PENDING" ? 409 : 403 },
      );
    }
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
    let hasHelperAccess = isAdminLevel;
    if (!isAdminLevel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { dcrAccess: true, dcrHelperAccess: true },
      });
      hasDcrAccess = !!user?.dcrAccess;
      hasHelperAccess = !!user?.dcrHelperAccess;
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
      if (!isAdminLevel && handlerId !== userId) {
        return NextResponse.json({ error: "无权查看其他用户处理的委托" }, { status: 403 });
      }
      const statusFilter = status && status.length > 0
        ? (status.length === 1 ? status[0] : { in: status })
        : undefined;

      where.AND = [
        { handlers: { some: { userId: handlerId } } },
        ...(isAdminLevel ? [] : [{ requestStatus: "APPROVED" }]),
        ...(statusFilter ? [{ status: statusFilter }] : []),
      ];
    } else if (isAdminLevel || (userRole === "MODERATOR" && requestStatus)) {
      // Admin / SuperAdmin sees all cases. Moderators can see the complete
      // review queue only when explicitly filtering by requestStatus.
      if (status && status.length > 0) {
        where.status = status.length === 1 ? status[0] : { in: status };
      }
    } else if (userRole === "DCR_HELPER" || hasHelperAccess) {
      // DCR_HELPER sees their own submissions in every review state. Other
      // users' cases are visible only after admin approval.
      const orClauses: Record<string, unknown>[] = [
        { submitterId: userId },
        { AND: [
          { handlers: { some: { userId } } },
          { requestStatus: "APPROVED" },
        ] },
      ];
      const statusValues = status && status.length > 0 ? status : null;
      where.AND = [
        { OR: orClauses },
        ...(statusValues ? [{ status: statusValues.length === 1 ? statusValues[0] : { in: statusValues } }] : []),
      ];
    } else if (hasDcrAccess) {
      // Regular users always see their own submissions. Cases belonging to
      // others remain hidden until approved and assigned to the current user.
      where.AND = [
        { OR: [
          { submitterId: userId },
          { AND: [
            { handlers: { some: { userId } } },
            { requestStatus: "APPROVED" },
          ] },
        ]},
      ];
      if (status && status.length > 0) {
        where.status = status.length === 1 ? status[0] : { in: status };
      }
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
