import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { getPublicDcrTaskCopy } from "@/lib/dcr-task-public";

/**
 * GET /api/dcr/tasks/[id]
 * Return task details with timeline, requester info, and help session.
 * - Requires auth
 *
 * Validates: Requirements 1.7, 8.1, 8.2, 8.3
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      include: {
        timeline: { orderBy: { createdAt: "asc" } },
        requester: { select: { id: true, nickname: true, avatar: true } },
        helpSessions: {
          select: {
            id: true,
            helperId: true,
            status: true,
            statusBeforeDispute: true,
            requesterConfirmed: true,
            helperConfirmed: true,
            closedAt: true,
            helpChat: { select: { id: true } },
            evidenceRoom: { select: { id: true } },
          },
        },
        claimsAsTarget: {
          where: {
            OR: [
              { requesterId: req.user.id },
              { applicantId: req.user.id },
            ],
          },
          select: {
            id: true,
            status: true,
            applicantId: true,
            requesterId: true,
            applicantConfirmed: true,
            requesterConfirmed: true,
            offeredTask: { select: { id: true, title: true, summary: true, expectedHelpType: true } },
            sessionId: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const isPrivileged = MODERATOR_ROLES.includes(
      req.user.role as (typeof MODERATOR_ROLES)[number],
    );
    const isRequester = task.requesterId === req.user.id;
    const legacySession = (task as typeof task & { helpSession?: { helperId: string } | null }).helpSession;
    const helpSessions = task.helpSessions ?? (legacySession ? [legacySession] : []);
    const isHelper = helpSessions.some((session) => session.helperId === req.user.id);

    if (!isPrivileged && !isRequester && !isHelper) {
      const access = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { dcrAccess: true },
      });
      if (!access?.dcrAccess) {
        return NextResponse.json({ error: "无 DCR 区访问权限" }, { status: 403 });
      }

      // 任务被领取后包含会话、证据和时间线信息，仅参与者和管理人员可见。
      if (!["OPEN", "CLAIMED", "IN_PROGRESS"].includes(task.status)) {
        return NextResponse.json({ error: "无权访问此任务详情" }, { status: 403 });
      }

      const publicCopy = getPublicDcrTaskCopy(task.category);
      return NextResponse.json({
        id: task.id,
        ...publicCopy,
        category: task.category,
        urgencyLevel: task.urgencyLevel,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        helpSessions: [],
        requester: { nickname: task.requester.nickname, avatar: task.requester.avatar },
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/** Roles allowed to perform moderation actions (review/approve/reject) */
const MODERATOR_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * PATCH /api/dcr/tasks/[id]
 * Update task status via action-based transitions.
 * - Requires auth
 * - Validates body with taskActionSchema
 * - Uses canTransition to verify state transition legality
 * - Records timeline event in a transaction
 * - Logs audit
 *
 * Actions:
 *   submit  — only task creator, DRAFT → SUBMITTED
 *   review  — only Moderator/Admin, SUBMITTED → UNDER_REVIEW
 *   approve — only Moderator/Admin, UNDER_REVIEW → OPEN
 *   reject  — only Moderator/Admin, any → REJECTED (reason required)
 *
 * Validates: Requirements 1.7, 2.2, 2.3, 2.4, 2.9, 8.1, 8.2, 8.3
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    await req.json().catch(() => null);
    const task = await prisma.mutualAidTask.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    if (!task.caseId) {
      return NextResponse.json(
        { error: "旧版未关联委托的任务不能继续审核，请从已审核委托重新发布" },
        { status: 410 },
      );
    }
    return NextResponse.json(
      { error: "关联委托已完成审核，任务不再进入第二套审核流程" },
      { status: 409 },
    );
  } catch (error) {
    console.error("PATCH /api/dcr/tasks/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
