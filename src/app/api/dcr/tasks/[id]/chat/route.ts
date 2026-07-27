import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { sendChatMessageSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { cursorWhere, encodeCompoundCursor, parseCompoundCursor } from "@/lib/compound-cursor";
import { createProtectedMediaUrl, generateObjectKey, getMediaKey, uploadPrivateObject } from "@/lib/oss";

/** Roles that can access HelpChat alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;
const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024;
const CHAT_FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "text/plain": "txt", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

/**
 * Verify the current user has access to the HelpChat for a given task.
 * Returns the helpSession (with helpChat and evidenceRoom) or a NextResponse error.
 */
async function verifyAccess(
  taskId: string,
  userId: string,
  userRole: string,
  sessionId?: string | null,
): Promise<
  | { ok: true; session: {
       id: string;
       status: string;
      requesterId: string;
      helperId: string;
      helpChat: { id: string } | null;
      evidenceRoom: { id: string } | null;
      task: { id: string; title: string; summary: string; expectedHelpType: string };
      claim: {
        offeredTask: { id: string; title: string; summary: string; expectedHelpType: string } | null;
      } | null;
    } }
  | { ok: false; response: NextResponse }
> {
  const session = await prisma.helpSession.findFirst({
    where: {
      taskId,
      ...(sessionId ? { id: sessionId } : { helperId: userId }),
    },
    include: {
      helpChat: true,
      evidenceRoom: true,
      task: { select: { id: true, title: true, summary: true, expectedHelpType: true } },
      claim: {
        select: {
          offeredTask: { select: { id: true, title: true, summary: true, expectedHelpType: true } },
        },
      },
    },
  });

  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "互助会话不存在" }, { status: 404 }) };
  }

  const isRequester = session.requesterId === userId;
  const isHelper = session.helperId === userId;
  const isPrivileged = PRIVILEGED_ROLES.includes(
    userRole as (typeof PRIVILEGED_ROLES)[number],
  );

  if (!isRequester && !isHelper && !isPrivileged) {
    return { ok: false, response: NextResponse.json({ error: "无权访问此聊天" }, { status: 403 }) };
  }

  return { ok: true, session };
}


/**
 * GET /api/dcr/tasks/[id]/chat
 * Return paginated chat messages for the task's HelpChat.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Returns the newest page in chronological order and accepts an older-message cursor
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

    const access = await verifyAccess(id, userId, userRole, new URL(req.url).searchParams.get("sessionId"));
    if (!access.ok) return access.response;

    const { session } = access;
    const chat = session.helpChat;

    if (!chat) {
      return NextResponse.json({ error: "聊天通道不存在" }, { status: 404 });
    }

    // Fetch newest-first so the initial page always contains the latest messages,
    // then reverse the page for chronological rendering.
    const url = new URL(req.url);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? parseCompoundCursor(cursorValue, `help-chat:${chat.id}`, "older") : null;
    if (cursorValue && !cursor) return NextResponse.json({ error: "无效的分页游标" }, { status: 400 });
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));

    const [rows, total] = await Promise.all([
      prisma.helpChatMessage.findMany({
        where: {
          chatId: chat.id,
          ...(cursor ? cursorWhere(cursor, "older") : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
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
      prisma.helpChatMessage.count({ where: { chatId: chat.id } }),
    ]);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    const messages = page.toReversed().map((message) => ({
      ...message,
      fileUrl: message.fileUrl && getMediaKey(message.fileUrl)
        ? createProtectedMediaUrl(getMediaKey(message.fileUrl)!, "DCR_CHAT", message.id)
        : null,
    }));

    return NextResponse.json({
      messages,
      mutualAid: {
        targetTask: session.task,
        offeredTask: session.claim?.offeredTask ?? null,
        mode: session.claim?.offeredTask ? "TASK_EXCHANGE" : "GOOD_SAMARITAN",
      },
      pagination: {
        pageSize,
        total,
        hasMore,
        nextCursor: hasMore && page.length > 0
          ? encodeCompoundCursor(`help-chat:${chat.id}`, "older", page.at(-1)!)
          : null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
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

    const access = await verifyAccess(id, userId, userRole, new URL(req.url).searchParams.get("sessionId"));
    if (!access.ok) return access.response;

    const { session } = access;
    const chat = session.helpChat;
    const evidenceRoom = session.evidenceRoom;

    if (!chat) {
      return NextResponse.json({ error: "聊天通道不存在" }, { status: 404 });
    }
    if (["DISPUTED", "COMPLETED", "CLOSED"].includes(session.status)) {
      return NextResponse.json({ error: "当前会话已暂停或结束，不能继续发送消息" }, { status: 409 });
    }

    // Rate limit: 30 requests per 60 seconds
    const rateLimited = await enforceRateLimit(`dcr-chat:${userId}`, 30, 60_000);
    if (rateLimited) {
      return new NextResponse(rateLimited.response.body, {
        status: 429,
        headers: rateLimited.response.headers,
      });
    }

    const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data") === true;
    let file: File | null = null;
    let body: unknown;
    if (isMultipart) {
      const formData = await req.formData();
      const candidate = formData.get("file");
      file = candidate instanceof File ? candidate : null;
      const content = String(formData.get("content") || "").trim();
      body = { content: content || (file ? "[附件]" : "") };
    } else {
      body = await req.json();
    }
    const parsed = sendChatMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { content, quotedMessageId, fileUrl } = parsed.data;
    if (!isMultipart && fileUrl) {
      return NextResponse.json({ error: "附件必须通过聊天上传接口提交" }, { status: 400 });
    }
    if (isMultipart && !file) {
      return NextResponse.json({ error: "请选择要上传的附件" }, { status: 400 });
    }
    if (file && (!CHAT_FILE_EXTENSIONS[file.type] || file.size <= 0 || file.size > MAX_CHAT_FILE_SIZE)) {
      return NextResponse.json({ error: "附件格式不支持或大小超过 20MB" }, { status: 400 });
    }

    // Sensitive word detection
    const matches = await scanContent(content);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "消息包含敏感词，请修改后重试", matches },
        { status: 400 },
      );
    }
    if (file && (await scanContent(file.name)).length > 0) {
      return NextResponse.json({ error: "文件名包含敏感词，请修改后重试" }, { status: 400 });
    }

    let fileKey: string | null = null;
    if (file) {
      if (!process.env.OSS_BUCKET || !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
        return NextResponse.json({ error: "文件存储服务未配置" }, { status: 503 });
      }
      fileKey = generateObjectKey(CHAT_FILE_EXTENSIONS[file.type]);
      await uploadPrivateObject(Buffer.from(await file.arrayBuffer()), fileKey, file.type);
    }

    // Create message (and optionally evidence item) in a transaction
    const message = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${id}`}))`;
      const current = await tx.helpSession.findUnique({ where: { id: session.id }, select: { status: true } });
      if (!current || ["DISPUTED", "COMPLETED", "CLOSED"].includes(current.status)) {
        throw new Error("SESSION_READ_ONLY");
      }
      const msg = await tx.helpChatMessage.create({
        data: {
          chatId: chat.id,
          content,
          senderId: userId,
          quotedMessageId: quotedMessageId ?? null,
          fileUrl: fileKey,
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      });

      if (fileKey && evidenceRoom) {
        await tx.evidenceItem.create({
          data: {
            type: "EVIDENCE_ITEM",
            description: content === "[附件]" ? "聊天附件" : content,
            fileUrl: fileKey,
            fileName: file?.name || null,
            fileSize: file?.size || null,
            roomId: evidenceRoom.id,
            uploaderId: userId,
          },
        });
      }

      return msg;
    });

    return NextResponse.json(
      {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        fileUrl: fileKey ? createProtectedMediaUrl(fileKey, "DCR_CHAT", message.id) : null,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_READ_ONLY") {
      return NextResponse.json({ error: "当前会话已暂停或结束，不能继续发送消息" }, { status: 409 });
    }
    console.error("POST /api/dcr/tasks/[id]/chat error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
