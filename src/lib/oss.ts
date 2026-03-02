import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "crypto";

// ==================== Config ====================

const OSS_REGION = process.env.OSS_REGION || "oss-cn-hangzhou";
const OSS_BUCKET = process.env.OSS_BUCKET || "";
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID || "";
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET || "";
const OSS_ENDPOINT = process.env.OSS_ENDPOINT || `https://${OSS_REGION}.aliyuncs.com`;
const OSS_CDN_DOMAIN = process.env.OSS_CDN_DOMAIN || `https://${OSS_BUCKET}.${OSS_REGION}.aliyuncs.com`;

/** Max file size before compression: 10 MB */
export const MAX_RAW_SIZE = 10 * 1024 * 1024;
/** Allowed MIME types */
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Compression target: max 1920px wide, quality 80, output webp */
const MAX_WIDTH = 1920;
const QUALITY = 80;

// ==================== S3 Client (Aliyun OSS compatible) ====================

const s3 = new S3Client({
  region: OSS_REGION,
  endpoint: OSS_ENDPOINT,
  credentials: {
    accessKeyId: OSS_ACCESS_KEY_ID,
    secretAccessKey: OSS_ACCESS_KEY_SECRET,
  },
  forcePathStyle: false,
});

// ==================== Helpers ====================

/**
 * Generate a unique object key for the uploaded image.
 * Format: uploads/{yyyy}/{MM}/{randomHash}.webp
 */
export function generateObjectKey(ext = "webp"): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const hash = crypto.randomBytes(16).toString("hex");
  return `uploads/${yyyy}/${mm}/${hash}.${ext}`;
}

/**
 * Compress an image buffer using sharp.
 * - Resizes to max 1920px width (preserving aspect ratio)
 * - Converts to WebP at quality 80
 * - GIF files are passed through without re-encoding (animated support)
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ data: Buffer; contentType: string }> {
  // GIF: pass through (sharp doesn't handle animated GIF well)
  if (mimeType === "image/gif") {
    return { data: buffer, contentType: "image/gif" };
  }

  const compressed = await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

  return { data: compressed, contentType: "image/webp" };
}

/**
 * Upload a buffer to Aliyun OSS and return the public URL.
 */
export async function uploadToOSS(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: OSS_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      ACL: "public-read",
    }),
  );

  return `${OSS_CDN_DOMAIN}/${key}`;
}

/**
 * Validate file type and size.
 */
export function validateFile(
  size: number,
  mimeType: string,
): string | null {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return `不支持的图片格式，仅支持 ${ALLOWED_TYPES.map((t) => t.split("/")[1]).join("、")}`;
  }
  if (size > MAX_RAW_SIZE) {
    return `图片大小不能超过 ${MAX_RAW_SIZE / 1024 / 1024} MB`;
  }
  return null;
}
