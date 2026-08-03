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
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/x-wav": "wav",
  "audio/vnd.wave": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  aac: "audio/aac", wav: "audio/wav", pdf: "application/pdf", txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip",
};

export function resolveMediaType(file: File): { extension: string; mimeType: string } | null {
  const normalizedMime = file.type.toLowerCase().split(";", 1)[0].trim();
  const mimeExtension = MIME_EXTENSIONS[normalizedMime];
  if (mimeExtension) return { extension: mimeExtension, mimeType: normalizedMime };
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const fallbackMime = EXTENSION_MIME_TYPES[extension];
  return fallbackMime ? { extension, mimeType: fallbackMime } : null;
}

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

    const mediaType = resolveMediaType(file);
    if (!mediaType) {
      return NextResponse.json({ error: "不支持该文件格式" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_MEDIA_SIZE) {
      return NextResponse.json({ error: "文件大小必须在 20MB 以内" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = generateObjectKey(mediaType.extension);
    await uploadPrivateObject(buffer, key, mediaType.mimeType);
    const url = createProtectedMediaUrl(key, "CASE", caseId);

    return NextResponse.json({
      url,
      name: file.name || `media.${mediaType.extension}`,
      mimeType: mediaType.mimeType,
      size: file.size,
      messageType: classifyMedia(mediaType.mimeType),
    });
  } catch (error) {
    console.error("POST /api/upload/case-media error:", error);
    return NextResponse.json({ error: "上传失败，请稍后重试" }, { status: 500 });
  }
}, undefined, { captureAllTelemetry: true });
