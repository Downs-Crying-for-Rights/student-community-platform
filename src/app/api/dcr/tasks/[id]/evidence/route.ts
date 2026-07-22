import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createEvidenceItemSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { generateObjectKey, uploadPrivateObject } from "@/lib/oss";

/** Roles that can access EvidenceRoom alongside A and B */
const PRIVILEGED_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;
const MAX_EVIDENCE_FILE_SIZE = 20 * 1024 * 1024;
const EVIDENCE_FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

/**
 * Verify the current user has access to the EvidenceRoom for a given task.
 * Returns the helpSession (with evidenceRoom) or a NextResponse error.
 */
async function verifyAccess(
  taskId: string,
  userId: string,
  userRole: string,
  sessionId?: string | null,
): Promise<
  | { ok: true; session: { id: string; status: string; requesterId: string; helperId: string; evidenceRoom: { id: string } | null } }
  | { ok: false; response: NextResponse }
> {
  const session = await prisma.helpSession.findFirst({
    where: {
      taskId,
      ...(sessionId ? { id: sessionId } : { helperId: userId }),
    },
    include: {
      evidenceRoom: true,
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
    return { ok: false, response: NextResponse.json({ error: "无权访问证据空间" }, { status: 403 }) };
  }

  return { ok: true, session };
}


/**
 * GET /api/dcr/tasks/[id]/evidence
 * Return evidence items for the task's EvidenceRoom, grouped by type.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Groups items by type: EVIDENCE_ITEM, NOTE, OUTCOME, FOLLOW_UP
 * - Writes audit log for VIEW_EVIDENCE
 *
 * Validates: Requirements 4.2, 4.7, 4.8
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
    const evidenceRoom = session.evidenceRoom;

    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    const allItems = await prisma.evidenceItem.findMany({
      where: { roomId: evidenceRoom.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        description: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        uploaderId: true,
      },
    });

    // Group by type
    const grouped: Record<string, typeof allItems> = {
      EVIDENCE_ITEM: [],
      NOTE: [],
      OUTCOME: [],
      FOLLOW_UP: [],
    };

    const protectedItems = allItems.map((item) => ({
      ...item,
      fileUrl: null,
      hasFile: Boolean(item.fileUrl),
    }));
    for (const item of protectedItems) {
      if (grouped[item.type]) {
        grouped[item.type].push(item);
      }
    }

    // Audit log
    await logAudit(userId, "VIEW_EVIDENCE", "EVIDENCE_ROOM", evidenceRoom.id);

    return NextResponse.json({
      items: grouped,
      total: protectedItems.length,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/dcr/tasks/[id]/evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * POST /api/dcr/tasks/[id]/evidence
 * Create an evidence item in the task's EvidenceRoom.
 * - Requires auth
 * - Verifies access: only requester (A), helper (B), Moderator, or Admin
 * - Validates body with createEvidenceItemSchema (sensitiveConfirmed must be true)
 * - Scans description for sensitive words; returns 400 if flagged
 * - If fileName provided, scans fileName for sensitive words too
 * - Creates EvidenceItem
 * - Writes audit log for CREATE_EVIDENCE
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.7, 4.8
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
    const evidenceRoom = session.evidenceRoom;

    if (!evidenceRoom) {
      return NextResponse.json({ error: "证据空间不存在" }, { status: 404 });
    }

    const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data") === true;
    let file: File | null = null;
    let body: unknown;

    if (isMultipart) {
      const formData = await req.formData();
      const candidate = formData.get("file");
      file = candidate instanceof File ? candidate : null;
      body = {
        type: formData.get("type"),
        description: formData.get("description"),
        sensitiveConfirmed: formData.get("sensitiveConfirmed") === "true",
        ...(file ? { fileName: file.name, fileSize: file.size } : {}),
      };
    } else {
      body = await req.json();
    }
    if (["DISPUTED", "COMPLETED", "CLOSED"].includes(session.status)) {
      return NextResponse.json({ error: "当前会话已暂停或结束，不能继续补充证据" }, { status: 409 });
    }

    const parsed = createEvidenceItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { type, description, fileName, fileSize } = parsed.data;
    let fileUrl = parsed.data.fileUrl;

    if (!isMultipart && (fileUrl || fileName || fileSize)) {
      return NextResponse.json({ error: "附件必须通过证据区上传接口提交" }, { status: 400 });
    }

    if (isMultipart && !file) {
      return NextResponse.json({ error: "请选择要上传的附件" }, { status: 400 });
    }

    if (file) {
      if (!EVIDENCE_FILE_EXTENSIONS[file.type]) {
        return NextResponse.json({ error: "不支持该附件格式" }, { status: 400 });
      }
      if (file.size <= 0 || file.size > MAX_EVIDENCE_FILE_SIZE) {
        return NextResponse.json({ error: "附件大小必须在 20MB 以内" }, { status: 400 });
      }
    }

    // Sensitive word detection on description
    const descMatches = await scanContent(description);
    if (descMatches.length > 0) {
      return NextResponse.json(
        { error: "描述包含敏感词，请修改后重试", matches: descMatches },
        { status: 400 },
      );
    }

    // Sensitive word detection on fileName if provided
    if (fileName) {
      const fileNameMatches = await scanContent(fileName);
      if (fileNameMatches.length > 0) {
        return NextResponse.json(
          { error: "文件名包含敏感词，请修改后重试", matches: fileNameMatches },
          { status: 400 },
        );
      }
    }

    if (file) {
      const limited = await enforceRateLimit(`evidence-upload:${userId}`, 20, 60_000);
      if (limited) return limited.response as unknown as NextResponse;
      if (!process.env.OSS_BUCKET || !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
        return NextResponse.json({ error: "文件存储服务未配置" }, { status: 503 });
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-task:${id}`}))`;
      const current = await tx.helpSession.findUnique({ where: { id: session.id }, select: { status: true } });
      if (!current || ["DISPUTED", "COMPLETED", "CLOSED"].includes(current.status)) {
        throw new Error("SESSION_READ_ONLY");
      }
      if (file) {
        const key = generateObjectKey(EVIDENCE_FILE_EXTENSIONS[file.type]);
        await uploadPrivateObject(Buffer.from(await file.arrayBuffer()), key, file.type);
        fileUrl = key;
      }
      const created = await tx.evidenceItem.create({
        data: {
          type, description, fileUrl: fileUrl ?? null, fileName: fileName ?? null,
          fileSize: fileSize ?? null, roomId: evidenceRoom.id, uploaderId: userId,
        },
        select: { id: true, type: true, createdAt: true },
      });
      await logAudit(userId, "CREATE_EVIDENCE", "EVIDENCE_ITEM", created.id, undefined, undefined, tx);
      return created;
    });

    return NextResponse.json(
      { id: item.id, type: item.type, createdAt: item.createdAt },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_READ_ONLY") {
      return NextResponse.json({ error: "当前会话已暂停或结束，不能继续补充证据" }, { status: 409 });
    }
    console.error("POST /api/dcr/tasks/[id]/evidence error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
