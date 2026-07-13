import { GetObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "crypto";

// ==================== Config ====================

const OSS_REGION = process.env.OSS_REGION || "oss-cn-hangzhou";
const OSS_BUCKET = process.env.OSS_BUCKET || "";
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID || "";
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET || "";
const OSS_ENDPOINT = process.env.OSS_ENDPOINT || `https://${OSS_REGION}.aliyuncs.com`;

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
      ACL: "private",
    }),
  );

  return createPrivateMediaUrl(key);
}

/**
 * Return an application-owned URL for a private OSS object. The signature
 * prevents callers from enumerating arbitrary object keys through the proxy.
 */
export function createPrivateMediaUrl(key: string): string {
  const appUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const signature = signMediaKey(key);
  return `${appUrl}/api/media?key=${encodeURIComponent(key)}&sig=${signature}`;
}

export function verifyMediaSignature(key: string, signature: string): boolean {
  if (!signature) return false;
  const expected = signMediaKey(key);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function signMediaKey(key: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for private media URLs");
  }
  return crypto.createHmac("sha256", secret).update(key).digest("base64url");
}

export async function getPrivateOSSObject(key: string) {
  return s3.send(new GetObjectCommand({
    Bucket: OSS_BUCKET,
    Key: key,
  }));
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
