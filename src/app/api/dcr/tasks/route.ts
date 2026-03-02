import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createTaskSchema, paginationSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

// ==================== Schemas ====================

const listQuerySchema = paginationSchema.extend({
  tab: z.enum(["recommended", "latest", "urgent"]).default("recommended"),
});

// Visible statuses for the task feed (OPEN and above)
const VISIBLE_STATUSES = [
  "OPEN",
  "CLAIMED",
  "IN_PROGRESS",
  "EVIDENCE_PENDING",
  "COMPLETED",
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
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // Check dcrAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
    });

    if (!user?.dcrAccess) {
      return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
    }

    // Rate limit
    const rateLimited = await enforceRateLimit(`dcr-task-create:${userId}`, 10, 60_000);
    if (rateLimited) {
      return rateLimited.response as unknown as NextResponse;
    }

    const body = await req.json();
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, category, summary, expectedHelpType, urgencyLevel, structuredFields } = parsed.data;

    // Sensitive word detection on title and summary
    const [titleMatches, summaryMatches] = await Promise.all([
      scanContent(title),
      scanContent(summary),
    ]);

    if (titleMatches.length > 0 || summaryMatches.length > 0) {
      return NextResponse.json(
        {
          error: "内容包含敏感词，请修改后重试",
          details: {
            title: titleMatches.map((m) => m.word),
            summary: summaryMatches.map((m) => m.word),
          },
        },
        { status: 400 },
      );
    }

    // Create task with DRAFT status
    const task = await prisma.mutualAidTask.create({
      data: {
        title,
        category,
        summary,
        expectedHelpType,
        urgencyLevel,
        structuredFields: structuredFields as unknown as import("@prisma/client").Prisma.InputJsonValue,
        status: "DRAFT",
        requesterId: userId,
      },
    });

    // Log audit
    await logAudit(userId, "CREATE_TASK", "TASK", task.id, { title, category, urgencyLevel });

    return NextResponse.json({ id: task.id, status: "DRAFT" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dcr/tasks error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
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
    const isAdminLevel = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
    if (!isAdminLevel) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { dcrAccess: true },
      });

      if (!user?.dcrAccess) {
        return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      tab: searchParams.get("tab") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, tab } = parsed.data;
    const skip = (page - 1) * pageSize;

    // Build where clause: only visible statuses
    const where = {
      status: { in: [...VISIBLE_STATUSES] },
    };

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
          requester: { select: { id: true, nickname: true } },
        },
      }),
      prisma.mutualAidTask.count({ where }),
    ]);

    return NextResponse.json({ tasks, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/dcr/tasks error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
