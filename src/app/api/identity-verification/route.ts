import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import {
  encryptIdentityDetails,
  hashVerifiedIdentity,
  identityMethodSchema,
  PHOTO_METHODS,
  realNameIdentitySchema,
  sensitiveEvidenceKey,
} from "@/lib/identity-verification";
import { deleteSensitiveObject, uploadSensitiveObject } from "@/lib/oss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const [user, application] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user.id },
      select: { realVerifiedAt: true, studentVerifiedAt: true },
    }),
    prisma.identityVerificationApplication.findFirst({
      where: { applicantId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, method: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true,
      },
    }),
  ]);
  return NextResponse.json({
    verification: {
      realVerified: Boolean(user?.realVerifiedAt),
      studentVerified: Boolean(user?.studentVerifiedAt),
    },
    application,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  const limited = await enforceRateLimit(`identity-verification:${req.user.id}`, 5, 60 * 60_000);
  if (limited) return limited.response as unknown as NextResponse;

  const existing = await prisma.identityVerificationApplication.findFirst({
    where: { applicantId: req.user.id, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "已有待审核申请，请等待管理员处理" }, { status: 409 });

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { realVerifiedAt: true, studentVerifiedAt: true, verifiedIdentityHash: true },
  });

  const contentType = req.headers.get("content-type") || "";
  const applicationId = randomUUID();
  let data: Parameters<typeof prisma.identityVerificationApplication.create>[0]["data"];
  let uploadedEvidenceKey: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_FILE_SIZE + 512 * 1024) {
      return NextResponse.json({ error: "请求体大小无效或超过限制" }, { status: 413 });
    }
    if (user?.studentVerifiedAt) return NextResponse.json({ error: "当前账户已完成学生身份认证" }, { status: 409 });
    const form = await req.formData();
    const method = identityMethodSchema.safeParse(form.get("method"));
    const file = form.get("file");
    if (!method.success || !PHOTO_METHODS.includes(method.data as (typeof PHOTO_METHODS)[number])) {
      return NextResponse.json({ error: "请选择有效的照片认证方式" }, { status: 400 });
    }
    if (form.get("privacyConfirmed") !== "true") {
      return NextResponse.json({ error: "请确认身份材料处理规则" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_FILE_SIZE || !ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "请上传 10MB 以内的 JPG、PNG 或 WebP 图片" }, { status: 400 });
    }
    if (!process.env.OSS_BUCKET || !process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_ACCESS_KEY_SECRET) {
      return NextResponse.json({ error: "身份材料存储服务未配置" }, { status: 503 });
    }
    let evidence: Buffer;
    try {
      const source = sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error", limitInputPixels: 24_000_000 });
      evidence = await source
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "图片内容无效或已损坏" }, { status: 400 });
    }
    const evidenceKey = sensitiveEvidenceKey(applicationId);
    await uploadSensitiveObject(evidence, evidenceKey, "image/webp");
    uploadedEvidenceKey = evidenceKey;
    data = {
      id: applicationId,
      applicantId: req.user.id,
      pendingApplicantId: req.user.id,
      method: method.data,
      evidenceKey,
      evidenceMime: "image/webp",
      evidenceSize: evidence.byteLength,
    };
  } else {
    if (user?.realVerifiedAt || user?.verifiedIdentityHash) {
      return NextResponse.json({ error: "当前账户已完成真实身份认证，不能替换实名信息" }, { status: 409 });
    }
    const body = await req.json().catch(() => null);
    const parsed = realNameIdentitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const lookupHash = hashVerifiedIdentity(parsed.data.idNumber);
    const duplicate = await prisma.user.findFirst({
      where: { verifiedIdentityHash: lookupHash, id: { not: req.user.id } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "该身份信息无法用于当前账户认证" }, { status: 409 });
    const encrypted = encryptIdentityDetails(applicationId, parsed.data.realName, parsed.data.idNumber);
    data = {
      id: applicationId,
      applicantId: req.user.id,
      pendingApplicantId: req.user.id,
      method: "REAL_NAME_ID",
      identityCiphertext: encrypted.ciphertext,
      identityIv: encrypted.iv,
      identityAuthTag: encrypted.authTag,
      identityKeyVersion: encrypted.keyVersion,
      identityLookupHash: lookupHash,
    };
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.identityVerificationApplication.create({ data, select: { id: true, method: true, status: true, createdAt: true } });
      await logAudit(req.user.id, AuditAction.IDENTITY_APPLICATION_SUBMIT, AuditTargetType.IDENTITY_APPLICATION, created.id, {
        method: created.method,
      }, undefined, tx);
      return created;
    });
    return NextResponse.json({ application }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (uploadedEvidenceKey) await deleteSensitiveObject(uploadedEvidenceKey).catch(() => undefined);
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "已有待审核申请，请等待管理员处理" }, { status: 409 });
    }
    throw error;
  }
}, undefined, { captureAllTelemetry: true });
