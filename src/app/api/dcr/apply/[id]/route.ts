import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType } from "@/lib/audit";
import { createNotification } from "@/lib/notification";
import { sendUserMail } from "@/lib/mail";
import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";
import { z } from "zod";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(),
});

class DcrReviewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DcrReviewError";
  }
}

async function runSerializableReview<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") {
        throw error;
      }
    }
  }
  throw lastError;
}

/**
 * PATCH /api/dcr/apply/[id]
 * 管理员审核 DCR 准入申请。申请、用户权限和审计在同一事务中提交；
 * 通知与邮件属于提交后的非关键副作用，失败不会制造半成功状态。
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const parsed = reviewSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { status, reviewNote } = parsed.data;
    const result = await runSerializableReview(() => prisma.$transaction(async (tx) => {
      const application = await tx.accessApplication.findUnique({
        where: { id },
        include: {
          applicant: {
            select: {
              id: true,
              role: true,
              createdAt: true,
              violationCount: true,
              phone: true,
              quizPassed: true,
              dcrAccess: true,
              dcrPledgeSigned: true,
            },
          },
          case_: {
            select: {
              id: true,
              submitterId: true,
              requestStatus: true,
            },
          },
        },
      });

      if (!application) throw new DcrReviewError(404, "APPLICATION_NOT_FOUND", "申请不存在");
      if (application.type !== "DCR") {
        throw new DcrReviewError(400, "APPLICATION_TYPE_INVALID", "该申请不是 DCR 准入申请");
      }
      if (application.status !== "PENDING") {
        throw new DcrReviewError(409, "APPLICATION_NOT_PENDING", "该申请已被审核");
      }

      if (status === "APPROVED") {
        const activeDcrUserCount = await tx.user.count({ where: { dcrAccess: true } });
        const decision = evaluateDcrAdmission({
          stage: "APPROVE_APPLICATION",
          user: application.applicant,
          application: {
            id: application.id,
            applicantId: application.applicantId,
            caseId: application.caseId,
            status: application.status,
            pledgeText: application.pledgeText,
          },
          case: application.case_,
          activeDcrUserCount,
        });

        if (!decision.allowed) {
          throw new DcrReviewError(403, decision.code, decision.reason);
        }
      }

      const updated = await tx.accessApplication.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status,
          reviewNote: reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        throw new DcrReviewError(409, "APPLICATION_NOT_PENDING", "该申请已被其他管理员处理");
      }

      if (status === "APPROVED") {
        await tx.user.update({
          where: { id: application.applicantId },
          data: { dcrAccess: true, dcrPledgeSigned: true },
        });
      }

      await tx.auditLog.create({
        data: {
          operatorId: req.user.id,
          action: status === "APPROVED"
            ? AuditAction.DCR_ACCESS_GRANT
            : AuditAction.DCR_ACCESS_REVOKE,
          targetType: AuditTargetType.APPLICATION,
          targetId: id,
          details: {
            applicantId: application.applicantId,
            caseId: application.caseId,
            decision: status,
            reviewNote: reviewNote ?? null,
          },
        },
      });

      const updatedApplication = await tx.accessApplication.findUnique({ where: { id } });
      return {
        application: updatedApplication,
        applicantId: application.applicantId,
        decision: status,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    const appUrl = `${(process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "")}/dcr`;
    const approved = result.decision === "APPROVED";
    const sideEffects = await Promise.allSettled([
      createNotification(
        result.applicantId,
        "DCR_ACCESS",
        approved ? "DCR 准入申请已通过" : "DCR 准入申请未通过",
        approved
          ? "您的 DCR 私密区准入申请已通过审核，现在可以访问 DCR 私密区了"
          : `您的 DCR 私密区准入申请未通过审核${reviewNote ? `，原因：${reviewNote}` : ""}`,
        approved ? "/dcr" : undefined,
      ),
      sendUserMail({
        userId: result.applicantId,
        subject: approved ? "DCR 准入申请已通过" : "DCR 准入申请审核结果",
        text: approved
          ? `您的 DCR 私密区准入申请已通过审核，现在可以访问 DCR 私密区了。\n\n访问：${appUrl}`
          : `您的 DCR 私密区准入申请未通过审核${reviewNote ? `，原因：${reviewNote}` : ""}。请登录平台查看详情。`,
      }),
    ]);

    for (const sideEffect of sideEffects) {
      if (sideEffect.status === "rejected") {
        console.error("DCR review side effect failed:", sideEffect.reason);
      }
    }

    return NextResponse.json({ application: result.application });
  } catch (error) {
    if (error instanceof DcrReviewError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("PATCH /api/dcr/apply/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
