import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  getDcrCurrentStep,
  type DcrBlocker,
  type DcrProgressDto,
  type DcrWorkspaceItem,
} from "@/components/dcr/dcr-workbench-contract";

const ACTIVE_CASE_STATUSES = ["PENDING", "NEED_MORE_INFO", "MANUAL_REVIEW"] as const;
const ACTIVE_TASK_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "OPEN",
  "CLAIMED",
  "IN_PROGRESS",
  "EVIDENCE_PENDING",
  "DISPUTED",
] as const;
const ACTIVE_CYCLE_STATUSES = ["INITIATING", "ACTIVE"] as const;

function toIso(value: Date): string {
  return value.toISOString();
}

/**
 * GET /api/dcr/progress
 * Authoritative DCR entry DTO. Every workspace query is scoped to the current
 * user's ownership or participation; it never returns public/global records.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const taskOwnership = {
      OR: [
        { requesterId: userId },
        { helpSession: { is: { OR: [{ requesterId: userId }, { helperId: userId }] } } },
      ],
    };
    const cycleOwnership = {
      OR: [
        { initiatorId: userId },
        { links: { some: { OR: [{ fromUserId: userId }, { toUserId: userId }] } } },
      ],
    };

    const [
      user,
      application,
      casesCount,
      casesTodoCount,
      recentCases,
      tasksCount,
      tasksTodoCount,
      recentTasks,
      cyclesCount,
      cyclesTodoCount,
      recentCycles,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          phone: true,
          quizPassed: true,
          dcrAccess: true,
          dcrPledgeSigned: true,
        },
      }),
      prisma.accessApplication.findFirst({
        where: { applicantId: userId, type: "DCR" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          caseId: true,
          case_: {
            select: {
              id: true,
              category: true,
              status: true,
              requestStatus: true,
              reviewNote: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.case.count({ where: { submitterId: userId } }),
      prisma.case.count({
        where: { submitterId: userId, requestStatus: { in: [...ACTIVE_CASE_STATUSES] } },
      }),
      prisma.case.findMany({
        where: { submitterId: userId },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, category: true, requestStatus: true, updatedAt: true },
      }),
      prisma.mutualAidTask.count({ where: taskOwnership }),
      prisma.mutualAidTask.count({
        where: { AND: [taskOwnership, { status: { in: [...ACTIVE_TASK_STATUSES] } }] },
      }),
      prisma.mutualAidTask.findMany({
        where: taskOwnership,
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, title: true, status: true, updatedAt: true },
      }),
      prisma.mutualAidCycle.count({ where: cycleOwnership }),
      prisma.mutualAidCycle.count({
        where: { AND: [cycleOwnership, { status: { in: [...ACTIVE_CYCLE_STATUSES] } }] },
      }),
      prisma.mutualAidCycle.findMany({
        where: cycleOwnership,
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { id: true, mode: true, status: true, updatedAt: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const phoneVerified = Boolean(user.phone);
    const accessGranted = isAdminRole(user.role)
      || (user.dcrAccess === true && user.dcrPledgeSigned === true);
    const linkedCase = application?.case_ ?? null;
    const currentStep = getDcrCurrentStep({
      accessGranted,
      phoneVerified,
      quizPassed: user.quizPassed,
      hasLinkedCase: Boolean(linkedCase),
    });

    const blockers: DcrBlocker[] = [];
    if (!accessGranted) {
      if (!phoneVerified) {
        blockers.push({
          code: "PHONE_REQUIRED",
          message: "请先完成手机号验证。",
          href: "/bindphone?callbackUrl=/dcr",
          cta: "验证手机号",
        });
      } else if (!user.quizPassed) {
        blockers.push({
          code: "QUIZ_REQUIRED",
          message: "请先完成 DCR 入频考核。",
          href: "/dcr/quiz",
          cta: "开始考核",
        });
      } else if (!application) {
        blockers.push({
          code: "CASE_REQUIRED",
          message: "请提交一份委托，系统会据此创建准入申请。",
          href: "/dcr/delegate",
          cta: "填写委托表",
        });
      } else if (!application.caseId || !linkedCase) {
        blockers.push({
          code: "APPLICATION_CASE_UNLINKED",
          message: "当前准入申请缺少关联委托，请联系管理员修复关联后再审核。",
          href: "/dcr/requests",
          cta: "查看我的委托",
        });
      } else if (application.status === "PENDING") {
        blockers.push({
          code: "APPLICATION_PENDING",
          message: "委托与准入申请正在等待管理员审核。",
          href: "/dcr/requests",
          cta: "查看审核状态",
        });
      } else if (application.status === "REJECTED") {
        blockers.push({
          code: "APPLICATION_REJECTED",
          message: application.reviewNote
            ? `准入申请已被驳回：${application.reviewNote}`
            : "准入申请已被驳回，可修正后重新提交委托。",
          href: "/dcr/delegate",
          cta: "重新提交委托",
        });
      } else {
        blockers.push({
          code: "ACCESS_NOT_GRANTED",
          message: "申请记录已通过，但 DCR 权限尚未生效，请联系管理员处理。",
          href: "/dcr/requests",
          cta: "查看申请记录",
        });
      }
    }

    const caseItems: DcrWorkspaceItem[] = recentCases.map((item) => ({
      id: item.id,
      title: `委托 · ${item.category}`,
      status: item.requestStatus,
      updatedAt: toIso(item.updatedAt),
      href: `/dcr/requests?caseId=${item.id}`,
    }));
    const taskItems: DcrWorkspaceItem[] = recentTasks.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: toIso(item.updatedAt),
      href: `/dcr/tasks/${item.id}`,
    }));
    const cycleItems: DcrWorkspaceItem[] = recentCycles.map((item) => ({
      id: item.id,
      title: item.mode === "TWO_PARTY" ? "双方互助闭环" : "三方互助闭环",
      status: item.status,
      updatedAt: toIso(item.updatedAt),
      href: `/dcr/cycles/${item.id}`,
    }));

    const dto: DcrProgressDto = {
      admission: {
        accessGranted,
        phoneVerified,
        quizPassed: user.quizPassed,
        currentStep,
        linkedCase: linkedCase
          ? {
              id: linkedCase.id,
              category: linkedCase.category,
              status: linkedCase.status,
              requestStatus: linkedCase.requestStatus,
              reviewNote: linkedCase.reviewNote,
              updatedAt: toIso(linkedCase.updatedAt),
            }
          : null,
        application: application
          ? {
              id: application.id,
              status: application.status,
              reviewNote: application.reviewNote,
              reviewedAt: application.reviewedAt ? toIso(application.reviewedAt) : null,
              createdAt: toIso(application.createdAt),
              caseId: application.caseId,
              caseLinkMissing: !application.caseId || !linkedCase,
            }
          : null,
        blockers,
      },
      workspace: {
        cases: { count: casesCount, todoCount: casesTodoCount, recent: caseItems },
        tasks: { count: tasksCount, todoCount: tasksTodoCount, recent: taskItems },
        cycles: { count: cyclesCount, todoCount: cyclesTodoCount, recent: cycleItems },
      },
    };

    return NextResponse.json(dto);
  } catch (error) {
    console.error("GET /api/dcr/progress error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
