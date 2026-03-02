import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const createMessageSchema = z.object({
  content: z.string().min(1, "消息内容不能为空").max(2000, "消息内容不能超过 2000 个字符"),
});

/** Helper type for CaseHandler entries returned from queries */
type HandlerEntry = { userId: string };

/**
 * GET /api/cases/[id]/messages
 * Get all messages for a case, ordered by createdAt asc.
 * - Requires auth
 * - Only submitter, handler (via CaseHandler), or ADMIN can access
 *
 * Validates: Requirements 2.6, 3.5, 3.8
 */
export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = await context.params;

    const caseRecord = await (prisma.case.findUnique as Function)({
      where: { id },
      select: {
        id: true,
        submitterId: true,
        handlerId: true,
        handlers: { select: { userId: true } },
      },
    }) as { id: string; submitterId: string; handlerId: string | null; handlers: HandlerEntry[] } | null;

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    // Access control: submitter, handler (CaseHandler table), or ADMIN
    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlers?.some((h) => h.userId === userId) ||
      caseRecord.handlerId === userId;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    if (!isSubmitter && !isHandler && !isAdmin) {
      return NextResponse.json({ error: "无权访问此委托消息" }, { status: 403 });
    }

    const messages = await prisma.message.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        content: true,
        isAnonymous: true,
        senderId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("GET /api/cases/[id]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/cases/[id]/messages
 * Create a new message in a case (group channel mode).
 * - Requires auth
 * - Only submitter, handler (via CaseHandler), or ADMIN can send
 * - OPENED: only submitter can send (one-way supplementary info)
 * - IN_PROGRESS / NEED_MORE_INFO: any participant can send
 * - CLOSED: blocked
 * - Messages are associated via caseId, visible to all participants (group mode)
 * - isAnonymous always true
 *
 * Validates: Requirements 2.6, 2.8, 3.5, 3.8
 */
export const POST = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { id } = await context.params;

    const body = await req.json();
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { content } = parsed.data;

    const caseRecord = await (prisma.case.findUnique as Function)({
      where: { id },
      select: {
        id: true,
        status: true,
        submitterId: true,
        handlerId: true,
        handlers: { select: { userId: true } },
      },
    }) as { id: string; status: string; submitterId: string; handlerId: string | null; handlers: HandlerEntry[] } | null;

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    // Access control: submitter, handler (CaseHandler table), or ADMIN
    const isSubmitter = caseRecord.submitterId === userId;
    const isHandler = caseRecord.handlers?.some((h) => h.userId === userId) ||
      caseRecord.handlerId === userId;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

    if (!isSubmitter && !isHandler && !isAdmin) {
      return NextResponse.json({ error: "无权访问此委托消息" }, { status: 403 });
    }

    // Status guard
    // OPENED: only submitter can send (one-way supplementary info)
    // IN_PROGRESS / NEED_MORE_INFO: any participant can send
    // CLOSED: blocked
    if (caseRecord.status === "CLOSED") {
      return NextResponse.json(
        { error: "当前状态不允许发送消息" },
        { status: 400 },
      );
    }

    if (caseRecord.status === "OPENED") {
      if (!isSubmitter) {
        return NextResponse.json(
          { error: "OPENED 状态仅提交者可发送补充信息" },
          { status: 400 },
        );
      }
    } else if (caseRecord.status !== "IN_PROGRESS" && caseRecord.status !== "NEED_MORE_INFO") {
      return NextResponse.json(
        { error: "当前状态不允许发送消息" },
        { status: 400 },
      );
    }

    // Group mode: messages are associated via caseId, visible to all participants.
    // receiverId kept for schema compatibility — set to submitterId as default.
    const receiverId = isSubmitter
      ? (caseRecord.handlerId ?? caseRecord.submitterId)
      : caseRecord.submitterId;

    const message = await prisma.message.create({
      data: {
        content,
        isAnonymous: true,
        senderId: userId,
        receiverId,
        caseId: id,
      },
      select: {
        id: true,
        content: true,
        isAnonymous: true,
        senderId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cases/[id]/messages error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
