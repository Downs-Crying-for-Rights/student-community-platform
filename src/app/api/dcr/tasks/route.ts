import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { TaskStatus } from "@prisma/client";
import { z } from "zod";
import { getPublicDcrTaskCopy } from "@/lib/dcr-task-public";
import { canUseDcrWorkspace } from "@/lib/dcr-capabilities";

// ==================== Schemas ====================

const listQuerySchema = paginationSchema.extend({
  tab: z.enum(["recommended", "latest", "urgent"]).default("recommended"),
  scope: z.enum(["all", "mine"]).default("all"),
});

// Visible statuses for the task feed (OPEN and above)
const VISIBLE_STATUSES = [
  TaskStatus.OPEN,
  TaskStatus.CLAIMED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.EVIDENCE_PENDING,
  TaskStatus.COMPLETED,
] as const;

/**
 * POST /api/dcr/tasks
 * Create a new mutual aid task.
 * - Requires auth + dcrAccess
 * - Validates body with createTaskSchema
 * - Runs sensitive word detection on title and summary
 * - Creates task with DRAFT status
 *
 * Validates: Requirements 1.1, 1.2, 1.6, 6.1, 6.2
 */
export const POST = withAuth(async (_req: AuthenticatedRequest) => {
  return NextResponse.json(
    { error: "通用任务创建已停用，请先提交委托表并在审核通过后发布", next: "/dcr/delegate" },
    { status: 410 },
  );
});

/**
 * GET /api/dcr/tasks
 * List mutual aid tasks for the feed.
 * - Requires auth + dcrAccess
 * - Supports tab parameter (recommended/latest/urgent)
 * - Pagination via page/pageSize
 * - Only returns tasks with OPEN status and above
 *
 * Validates: Requirements 7.1, 7.2
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check dcrAccess (Admin/SuperAdmin bypass)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true, dcrPledgeSigned: true },
    });
    if (!user || !canUseDcrWorkspace({ ...user, role: userRole })) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      tab: searchParams.get("tab") ?? undefined,
      scope: searchParams.get("scope") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, tab, scope } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: Record<string, unknown> = scope === "mine"
      ? { requesterId: userId }
      : { status: { in: [...VISIBLE_STATUSES] } };

    // Sort based on tab
    let orderBy: Record<string, string>[] | Record<string, string>;
    switch (tab) {
      case "urgent":
        orderBy = [{ urgencyLevel: "desc" }, { createdAt: "desc" }];
        break;
      case "latest":
        orderBy = { createdAt: "desc" };
        break;
      case "recommended":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const [tasks, total] = await Promise.all([
      prisma.mutualAidTask.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          category: true,
          summary: true,
          urgencyLevel: true,
          status: true,
          expectedHelpType: true,
          createdAt: true,
          case_: { select: { province: true, city: true, riskPreference: true } },
          requester: { select: { id: true, nickname: true } },
        },
      }),
      prisma.mutualAidTask.count({ where }),
    ]);

    const visibleTasks = tasks.map((task) => ({
          ...task,
          ...(scope === "mine" ? {} : getPublicDcrTaskCopy(task.category)),
          province: task.case_?.province ?? null,
          city: task.case_?.city ?? null,
          contactPreference: task.case_?.riskPreference ?? "仅站内沟通",
          case_: undefined,
          requester: scope === "mine" ? task.requester : { nickname: task.requester.nickname },
        }));

    return NextResponse.json({ tasks: visibleTasks, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/dcr/tasks error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
