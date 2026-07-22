import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import {
  encryptIdentityDetails,
  encryptSchoolDetails,
  hashVerifiedIdentity,
  identityMethodSchema,
  PHOTO_METHODS,
  realNameIdentitySchema,
  schoolUniformSchema,
  sensitiveEvidenceKey,
} from "@/lib/identity-verification";
import { deleteSensitiveObject, uploadSensitiveObject } from "@/lib/oss";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  const [user, application, revocationRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user.id },
      select: { realVerifiedAt: true, studentVerifiedAt: true },
    }),
    prisma.identityVerificationApplication.findFirst({
      where: { applicantId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, method: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true, cancelledAt: true,
      },
    }),
    prisma.identityVerificationRevocationRequest.findFirst({
      where: { userId: req.user.id },
      orderBy: { requestedAt: "desc" },
      select: { id: true, scope: true, status: true, reason: true, reviewNote: true, requestedAt: true, reviewedAt: true },
    }),
  ]);
  return NextResponse.json({
    verification: {
      realVerified: Boolean(user?.realVerifiedAt),
      studentVerified: Boolean(user?.studentVerifiedAt),
    },
    application,
    revocationRequest,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const DELETE = withAuth(async (req: AuthenticatedRequest) => {
  const application = await prisma.identityVerificationApplication.findFirst({
    where: { applicantId: req.user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, evidenceKey: true, method: true },
  });
  if (!application) return NextResponse.json({ error: "没有可撤回的待审核申请" }, { status: 404 });

  const cancelled = await prisma.$transaction(async (tx) => {
    const changed = await tx.identityVerificationApplication.updateMany({
      where: { id: application.id, applicantId: req.user.id, status: "PENDING" },
      data: {
        status: "CANCELLED", cancelledAt: new Date(), pendingApplicantId: null,
        evidenceDeleteAfter: application.evidenceKey ? new Date() : null,
        identityCiphertext: null, identityIv: null, identityAuthTag: null,
        identityKeyVersion: null, identityLookupHash: null,
      },
    });
    if (changed.count !== 1) return false;
    await logAudit(req.user.id, AuditAction.IDENTITY_APPLICATION_CANCEL, AuditTargetType.IDENTITY_APPLICATION, application.id, {
      method: application.method,
    }, undefined, tx);
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!cancelled) return NextResponse.json({ error: "申请已被处理，无法撤回" }, { status: 409 });

  if (application.evidenceKey) {
    try {
      await deleteSensitiveObject(application.evidenceKey);
      await prisma.identityVerificationApplication.updateMany({
        where: { id: application.id, status: "CANCELLED", evidenceKey: application.evidenceKey },
        data: { evidenceKey: null, evidenceMime: null, evidenceSize: null, evidenceDeleteAfter: null },
      });
    } catch (error) {
      // Keep the private object key scheduled for the cleanup job, while CANCELLED denies all reads.
      console.error("Cancelled identity evidence cleanup failed", error);
    }
  }
  return NextResponse.json({ status: "CANCELLED" }, { headers: { "Cache-Control": "private, no-store" } });
}, undefined, { captureAllTelemetry: true });

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
    const form = await req.formData();
    const method = identityMethodSchema.safeParse(form.get("method"));
    const file = form.get("file");
    if (!method.success || !PHOTO_METHODS.includes(method.data as (typeof PHOTO_METHODS)[number])) {
      return NextResponse.json({ error: "请选择有效的照片认证方式" }, { status: 400 });
    }
    if (form.get("privacyConfirmed") !== "true") {
      return NextResponse.json({ error: "请确认身份材料处理规则" }, { status: 400 });
    }
    if (form.get("dcrOnlyNoteConfirmed") !== "true") {
      return NextResponse.json({ error: "请确认认证材料与“仅供DCR认证”纸条同框" }, { status: 400 });
    }

    let encrypted: ReturnType<typeof encryptIdentityDetails> | null = null;
    let lookupHash: string | null = null;
    if (method.data === "ID_HOLDING_PHOTO") {
      if (user?.realVerifiedAt || user?.verifiedIdentityHash) {
        return NextResponse.json({ error: "当前账户已完成真实身份认证，不能替换实名信息" }, { status: 409 });
      }
      const identity = realNameIdentitySchema.safeParse({
        realName: form.get("realName"), idNumber: form.get("idNumber"), privacyConfirmed: true,
      });
      if (!identity.success) return NextResponse.json({ error: "姓名或身份证号校验失败", details: identity.error.flatten().fieldErrors }, { status: 400 });
      lookupHash = hashVerifiedIdentity(identity.data.idNumber);
      const duplicate = await prisma.user.findFirst({
        where: { verifiedIdentityHash: lookupHash, id: { not: req.user.id } }, select: { id: true },
      });
      if (duplicate) return NextResponse.json({ error: "该身份信息无法用于当前账户认证" }, { status: 409 });
      encrypted = encryptIdentityDetails(applicationId, identity.data.realName, identity.data.idNumber);
    } else if (method.data === "SCHOOL_UNIFORM") {
      if (user?.studentVerifiedAt) return NextResponse.json({ error: "当前账户已完成学生身份认证" }, { status: 409 });
      const school = schoolUniformSchema.safeParse({
        schoolName: form.get("schoolName"),
        nonShenzhenUniformConfirmed: form.get("nonShenzhenUniformConfirmed") === "true",
        privacyConfirmed: true,
      });
      if (!school.success) return NextResponse.json({ error: "学校信息校验失败", details: school.error.flatten().fieldErrors }, { status: 400 });
      encrypted = encryptSchoolDetails(applicationId, school.data.schoolName);
    } else if (user?.studentVerifiedAt) {
      return NextResponse.json({ error: "当前账户已完成学生身份认证" }, { status: 409 });
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
      ...(encrypted ? {
        identityCiphertext: encrypted.ciphertext,
        identityIv: encrypted.iv,
        identityAuthTag: encrypted.authTag,
        identityKeyVersion: encrypted.keyVersion,
      } : {}),
      ...(lookupHash ? { identityLookupHash: lookupHash } : {}),
    };
  } else {
    return NextResponse.json({ error: "请选择新的照片认证方式提交申请" }, { status: 400 });
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
