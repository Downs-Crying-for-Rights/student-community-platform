import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import {
  validateFile,
  compressImage,
  generateObjectKey,
  uploadToOSS,
} from "@/lib/oss";

/** Rate limit: 20 uploads per 60 seconds per user */
const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 60 * 1000;

/**
 * POST /api/upload
 * Upload a single image file.
 * - Auth required
 * - Rate limited: 20 req/min per user
 * - Validates file type (jpeg/png/webp/gif) and size (≤10MB)
 * - Compresses to WebP (max 1920px wide, quality 80)
 * - Uploads to Aliyun OSS
 * - Returns { url } with the CDN URL
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  // Rate limit check
  const rateLimitKey = `upload:${req.user.id}`;
  const limited = await enforceRateLimit(rateLimitKey, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
  if (limited) {
    return limited.response;
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "请选择要上传的图片" }, { status: 400 });
    }

    // Validate type and size
    const validationError = validateFile(file.size, file.type);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compress
    const { data, contentType } = await compressImage(buffer, file.type);

    // Generate key and upload
    const ext = contentType === "image/gif" ? "gif" : "webp";
    const key = generateObjectKey(ext);
    const url = await uploadToOSS(data, key, contentType);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json({ error: "上传失败，请稍后重试" }, { status: 500 });
  }
});
