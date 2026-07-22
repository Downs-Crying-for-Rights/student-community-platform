import { NextResponse } from "next/server";
import { Prisma, TaskStatus, UrgencyLevel } from "@prisma/client";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";
import {
  runSerializableTransaction,
  SerializableTransactionConflict,
} from "@/lib/serializable-transaction";
import { getPublicDcrTaskCopy } from "@/lib/dcr-task-public";
import { canUseDcrWorkspace } from "@/lib/dcr-capabilities";

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

/** List the current user's delegation forms that already passed administrator review. */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { dcrAccess: true, dcrPledgeSigned: true },
  });

  if (!user || !canUseDcrWorkspace({ ...user, role: req.user.role })) {
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
      select: { dcrAccess: true, dcrPledgeSigned: true },
    });
    if (!user || !canUseDcrWorkspace({ ...user, role: req.user.role })) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    const rateLimited = await enforceRateLimit(`dcr-task-from-case:${userId}`, 10, 60_000);
    if (rateLimited) return rateLimited.response as unknown as NextResponse;

    const result = await runSerializableTransaction(async (tx) => {
      const approvedCase = await tx.case.findUnique({
        where: { id: parsed.data.caseId },
        select: { id: true, submitterId: true, requestStatus: true, category: true },
      });

      if (!approvedCase) return { kind: "not-found" as const };
      if (approvedCase.submitterId !== userId) return { kind: "forbidden" as const };
      if (approvedCase.requestStatus !== "APPROVED") return { kind: "not-approved" as const };

      const existingTask = await tx.mutualAidTask.findFirst({
        where: {
          requesterId: userId,
          caseId: approvedCase.id,
          status: { in: [...ACTIVE_TASK_STATUSES] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
      if (existingTask) return { kind: "existing" as const, task: existingTask, caseId: approvedCase.id };

      const copy = getPublicDcrTaskCopy(approvedCase.category);
      const task = await tx.mutualAidTask.create({
        data: {
          ...copy,
          category: approvedCase.category,
          urgencyLevel: parsed.data.urgencyLevel,
          status: TaskStatus.OPEN,
          requesterId: userId,
          caseId: approvedCase.id,
          structuredFields: { source: "APPROVED_DELEGATION_CASE" } as Prisma.InputJsonValue,
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
      }, undefined, tx);
      return { kind: "created" as const, task, caseId: approvedCase.id };
    });

    if (result.kind === "not-found") {
      return NextResponse.json({ error: "委托表不存在" }, { status: 404 });
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: "只能使用本人提交的委托表" }, { status: 403 });
    }
    if (result.kind === "not-approved") {
      return NextResponse.json({ error: "该委托表尚未通过管理员审核" }, { status: 409 });
    }
    if (result.kind === "existing") {
      return NextResponse.json({ task: result.task, existing: true, reusedApprovedCase: true });
    }

    return NextResponse.json({ task: result.task, existing: false, reusedApprovedCase: true }, { status: 201 });
  } catch (error) {
    if (error instanceof SerializableTransactionConflict) {
      return NextResponse.json(
        { error: "发布冲突，请重试", code: "TASK_PUBLISH_CONFLICT" },
        { status: 409 },
      );
    }
    console.error("POST /api/dcr/tasks/from-case error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
