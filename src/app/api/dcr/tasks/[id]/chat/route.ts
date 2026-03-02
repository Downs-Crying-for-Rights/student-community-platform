import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { sendChatMessageSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { enforceRateLimit } from "@/lib/rate-limiter";

/** Roles that can access HelpChat alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * Verify the current user has access to the HelpChat for a given task.
 * Returns the helpSession (with helpChat and evidenceRoom) or a NextResponse error.
 */
async function verifyAccess(
  taskId: string,
  userId: string,
  userRole: string,
): Promise<
  | { ok: true; session: { id: string; requesterId: string; helperId: string; helpChat: { id: string } | null; evidenceRoom: { id: string } | null } }
  | { ok: false; response: NextResponse }
> {
  const task = await (prisma as any).mutualAidTask.findUnique({
    where: { id: taskId },
    include: {
      helpSession: {
        include: {
          helpChat: true,
          evidenceRoom: true,
        },
      },
    },
  });

  if (!task) {
    return { ok: false, response: NextResponse.json({ error: "任务不存在" }, { status: 404 }) };
  }

  if (!task.helpSession) {
    return { ok: false, response: NextResponse.json({ error: "互助会话不存在" }, { status: 404 }) };
  }

  const isRequester = task.helpSession.requesterId === userId;
  const isHelper = task.helpSession.helperId === userId;
  const isPrivileged = PRIVILEGED_ROLES.includes(
    userRole as (typeof PRIVILEGED_ROLES)[number],
  );

  if (!isRequester && !isHelper && !isPrivileged) {
    return { ok: false, response: NextResponse.json({ error: "无权访问此聊天" }, { status: 403 }) };
  }

  return { ok: true, session: task.helpSession };
}


/**
 * GET /api/dcr/tasks/[id]/chat
 * Return paginated chat messages for the task's HelpChat.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Supports pagination via query params: page (default 1), pageSize (default 20)
 * - Messages ordered by createdAt asc
 *
 * Validates: Requirements 3.2, 3.7
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const access = await verifyAccess(id, userId, userRole);
    if (!access.ok) return access.response;

    const { session } = access;
    const chat = session.helpChat;

    if (!chat) {
      return NextResponse.json({ error: "聊天通道不存在" }, { status: 404 });
    }

    // Parse pagination from query params
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
    const skip = (page - 1) * pageSize;

    const [messages, total] = await Promise.all([
      (prisma as any).helpChatMessage.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          content: true,
          fileUrl: true,
          quotedMessageId: true,
          isSystemMessage: true,
          isEvidence: true,
          createdAt: true,
          senderId: true,
        },
      }),
      (prisma as any).helpChatMessage.count({ where: { chatId: chat.id } }),
    ]);

    return NextResponse.json({
      messages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id]/chat error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/dcr/tasks/[id]/chat
 * Send a chat message in the task's HelpChat.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Rate limit: 30 requests per 60 seconds per user
 * - Validates body with sendChatMessageSchema
 * - Scans content for sensitive words; returns 400 if flagged
 * - Creates HelpChatMessage
 * - If fileUrl is provided, auto-creates EVIDENCE_ITEM in EvidenceRoom
 *
 * Validates: Requirements 3.2, 3.4, 3.5, 3.7, 6.1, 6.2
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const access = await verifyAccess(id, userId, userRole);
    if (!access.ok) return access.response;

    const { session } = access;
    const chat = session.helpChat;
    const evidenceRoom = session.evidenceRoom;

    if (!chat) {
      return NextResponse.json({ error: "聊天通道不存在" }, { status: 404 });
    }

    // Rate limit: 30 requests per 60 seconds
    const rateLimited = await enforceRateLimit(`dcr-chat:${userId}`, 30, 60_000);
    if (rateLimited) {
      return new NextResponse(rateLimited.response.body, {
        status: 429,
        headers: rateLimited.response.headers,
      });
    }

    // Parse and validate body
    const body = await req.json();
    const parsed = sendChatMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { content, quotedMessageId, fileUrl } = parsed.data;

    // Sensitive word detection
    const matches = await scanContent(content);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "消息包含敏感词，请修改后重试", matches },
        { status: 400 },
      );
    }

    // Create message (and optionally evidence item) in a transaction
    const message = await prisma.$transaction(async (tx: any) => {
      const msg = await tx.helpChatMessage.create({
        data: {
          chatId: chat.id,
          content,
          senderId: userId,
          quotedMessageId: quotedMessageId ?? null,
          fileUrl: fileUrl ?? null,
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      });

      // If fileUrl is provided, auto-create EVIDENCE_ITEM in EvidenceRoom
      if (fileUrl && evidenceRoom) {
        await tx.evidenceItem.create({
          data: {
            type: "EVIDENCE_ITEM",
            description: "Chat file upload",
            fileUrl,
            roomId: evidenceRoom.id,
            uploaderId: userId,
          },
        });
      }

      return msg;
    });

    return NextResponse.json(
      { id: message.id, content: message.content, createdAt: message.createdAt },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/dcr/tasks/[id]/chat error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
