import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { createProtectedMediaUrl, generateObjectKey, uploadPrivateObject } from "@/lib/oss";
import prisma from "@/lib/prisma";

const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

function classifyMedia(mimeType: string): "IMAGE" | "AUDIO" | "FILE" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

/** Upload private media used in a DCR case conversation. */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const limited = await enforceRateLimit(`case-media:${req.user.id}`, 20, 60_000);
  if (limited) return limited.response as never;

  if (!process.env.OSS_BUCKET || !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
    return NextResponse.json({ error: "文件存储服务未配置" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const caseId = String(formData.get("caseId") || "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择要发送的文件" }, { status: 400 });
    }
    const privileged = ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(req.user.role);
    const caseRecord = await prisma.case.findFirst({
      where: { id: caseId, ...(privileged ? {} : { OR: [{ submitterId: req.user.id }, { handlerId: req.user.id }, { handlers: { some: { userId: req.user.id } } }] }) },
      select: { id: true },
    });
    if (!caseRecord) return NextResponse.json({ error: "无权向该委托上传文件" }, { status: 403 });

    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) {
      return NextResponse.json({ error: "不支持该文件格式" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MEDIA_SIZE) {
      return NextResponse.json({ error: "文件大小必须在 20MB 以内" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(extension);
    await uploadPrivateObject(buffer, key, file.type);
    const url = createProtectedMediaUrl(key, "CASE", caseId);

    return NextResponse.json({
      url,
      name: file.name || `media.${extension}`,
      mimeType: file.type,
      size: file.size,
      messageType: classifyMedia(file.type),
    });
  } catch (error) {
    console.error("POST /api/upload/case-media error:", error);
    return NextResponse.json({ error: "上传失败，请稍后重试" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
