import { NextResponse } from "next/server";
import { Prisma, TaskStatus, UrgencyLevel } from "@prisma/client";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";

const publishSchema = z.object({
  caseId: z.string().min(1),
  urgencyLevel: z.nativeEnum(UrgencyLevel).default(UrgencyLevel.MEDIUM),
});

const ACTIVE_TASK_STATUSES = [
  TaskStatus.OPEN,
  TaskStatus.CLAIMED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.EVIDENCE_PENDING,
] as const;

function delegationSnapshot(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** List the current user's delegation forms that already passed administrator review. */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { dcrAccess: true },
  });

  if (!user?.dcrAccess) {
    return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
  }

  const cases = await prisma.case.findMany({
    where: { submitterId: req.user.id, requestStatus: "APPROVED" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      category: true,
      formData: true,
      reviewNote: true,
      updatedAt: true,
      mutualAidTasks: {
        where: { status: { in: [...ACTIVE_TASK_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });

  return NextResponse.json({
    cases: cases.map((item) => {
      const form = delegationSnapshot(item.formData);
      return {
        id: item.id,
        category: item.category,
        schoolName: text(form.schoolName) || "未填写学校名称",
        contentType: text(form.contentType) || "DCR 委托",
        description: text(form.description),
        reviewNote: item.reviewNote,
        approvedAt: item.updatedAt,
        activeTask: item.mutualAidTasks[0] ?? null,
      };
    }),
  });
}, undefined, { captureAllTelemetry: true });

/** Publish directly from an approved delegation form without a second review. */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const body = await req.json();
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
    });
    if (!user?.dcrAccess) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    const rateLimited = await enforceRateLimit(`dcr-task-from-case:${userId}`, 10, 60_000);
    if (rateLimited) return rateLimited.response as unknown as NextResponse;

    const approvedCase = await prisma.case.findUnique({
      where: { id: parsed.data.caseId },
      select: {
        id: true,
        submitterId: true,
        requestStatus: true,
        category: true,
        formData: true,
        pledgeText: true,
        grade: true,
        timeRange: true,
        province: true,
        city: true,
        expectedHelperProvince: true,
        riskPreference: true,
      },
    });

    if (!approvedCase) {
      return NextResponse.json({ error: "委托表不存在" }, { status: 404 });
    }
    if (approvedCase.submitterId !== userId) {
      return NextResponse.json({ error: "只能使用本人提交的委托表" }, { status: 403 });
    }
    if (approvedCase.requestStatus !== "APPROVED") {
      return NextResponse.json({ error: "该委托表尚未通过管理员审核" }, { status: 409 });
    }

    const existingTask = await prisma.mutualAidTask.findFirst({
      where: {
        requesterId: userId,
        caseId: approvedCase.id,
        status: { in: [...ACTIVE_TASK_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (existingTask) {
      return NextResponse.json({ task: existingTask, existing: true, reusedApprovedCase: true });
    }

    const form = delegationSnapshot(approvedCase.formData);
    const schoolName = text(form.schoolName) || "DCR 委托";
    const contentType = text(form.contentType) || "互助事项";
    const description = text(form.description) || approvedCase.pledgeText;
    const demands = [...stringList(form.demands), text(form.otherDemand)].filter(Boolean);

    const task = await prisma.mutualAidTask.create({
      data: {
        title: `${schoolName} · ${contentType}`,
        category: approvedCase.category,
        summary: description,
        expectedHelpType: demands.join("、") || "基于已审核委托提供互助",
        urgencyLevel: parsed.data.urgencyLevel,
        status: TaskStatus.OPEN,
        requesterId: userId,
        caseId: approvedCase.id,
        structuredFields: {
          source: "APPROVED_DELEGATION_CASE",
          sourceCaseId: approvedCase.id,
          approvedFormData: form,
          grade: approvedCase.grade,
          timeRange: approvedCase.timeRange,
          province: approvedCase.province,
          city: approvedCase.city,
          expectedHelperProvince: approvedCase.expectedHelperProvince,
          riskPreference: approvedCase.riskPreference,
        } as Prisma.InputJsonValue,
        timeline: {
          create: {
            action: "publish_from_approved_case",
            newStatus: TaskStatus.OPEN,
            details: "复用入频时已审核的委托表，免除重复审核",
            operatorId: userId,
          },
        },
      },
      select: { id: true, status: true },
    });

    await logAudit(userId, "PUBLISH_TASK_FROM_APPROVED_CASE", "TASK", task.id, {
      caseId: approvedCase.id,
      status: task.status,
    });

    return NextResponse.json({ task, existing: false, reusedApprovedCase: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dcr/tasks/from-case error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
