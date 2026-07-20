import { Prisma, TaskStatus, UrgencyLevel, type QQGrantPurpose } from "@prisma/client";
import { NextResponse } from "next/server";

import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";
import { reconcileRejectedDcrApplications } from "@/lib/dcr-application-reconciliation";
import { type DelegationInput, extractFields } from "@/lib/dcr-field-extractor";
import { formatDelegation, type DelegationFormData } from "@/lib/dcr-delegation-types";
import { getPublicDcrTaskCopy } from "@/lib/dcr-task-public";
import { reviewDelegation } from "@/lib/dcr-review-rules";
import { getQQConfig } from "@/lib/qq-config";
import {
  hashQQDelegationDraft,
  validateQQDelegationDraft,
  type QQDelegationDraft,
} from "@/lib/qq-delegation";
import { buildQQGrantConsumeWhere, hashQQGrant } from "@/lib/qq-grants";
import { decryptQQIdentity, hashQQIdentity } from "@/lib/qq-identity";
import prisma from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac";
import { canSubmitDcrDelegation } from "@/lib/dcr-capabilities";
import {
  runSerializableTransaction,
  SerializableTransactionConflict,
} from "@/lib/serializable-transaction";
import { scanContent } from "@/lib/sensitive-engine";

export const QQ_CONFIRMATIONS = [
  "我确认以上信息真实有效",
  "我已移除所有可识别个人信息",
  "我了解平台不组织、不指挥、不实施任何举报或对抗行动",
] as const;

const CONTENT_TYPE_LABELS: Record<QQDelegationDraft["contentType"], string> = {
  TUTORING: "学校补课类",
  EARLY_START: "学校提前开学类",
  NO_WEEKENDS: "学校不双休类",
  EXTERNAL_TRAINING: "校外培训机构类",
  OTHER: "其他",
};

export class QQH5Error extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly next?: string,
  ) {
    super(message);
    this.name = "QQH5Error";
  }
}

export function qqNoStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function maskQQIdentity(value: string): string {
  if (value.length <= 5) return `${value.slice(0, 1)}***${value.slice(-1)}`;
  return `${value.slice(0, 2)}${"*".repeat(Math.min(6, value.length - 4))}${value.slice(-2)}`;
}

function tokenHash(token: string): string {
  try {
    return hashQQGrant(token, getQQConfig().grantHmacKey);
  } catch {
    throw new QQH5Error("GRANT_INVALID", "链接无效或已损坏", 400);
  }
}

function activeGrantWhere(token: string, purpose: QQGrantPurpose, now = new Date()) {
  return buildQQGrantConsumeWhere(tokenHash(token), purpose, now);
}

function assertIdentityGrant(grant: {
  identityLookupHash: string | null;
  identityCiphertext: string | null;
  identityIv: string | null;
  identityAuthTag: string | null;
  identityKeyVersion: number | null;
}) {
  if (
    !grant.identityLookupHash ||
    !grant.identityCiphertext ||
    !grant.identityIv ||
    !grant.identityAuthTag ||
    !grant.identityKeyVersion
  ) {
    throw new QQH5Error("GRANT_INVALID", "绑定信息不完整，请重新从 QQ 发起绑定", 409);
  }

  const config = getQQConfig();
  const identity = decryptQQIdentity(
    {
      ciphertext: grant.identityCiphertext,
      iv: grant.identityIv,
      authTag: grant.identityAuthTag,
      keyVersion: grant.identityKeyVersion,
    },
    config.identityEncryptionKey,
  );
  if (hashQQIdentity(identity, config.identityHmacKey) !== grant.identityLookupHash) {
    throw new QQH5Error("GRANT_INVALID", "绑定信息校验失败，请重新从 QQ 发起绑定", 409);
  }
  return identity;
}

export async function previewQQBinding(userId: string, token: string) {
  const grant = await prisma.qQGrant.findFirst({
    where: {
      ...activeGrantWhere(token, "IDENTITY_BIND"),
      OR: [{ userId: null }, { userId }],
    },
    select: {
      identityLookupHash: true,
      identityCiphertext: true,
      identityIv: true,
      identityAuthTag: true,
      identityKeyVersion: true,
      expiresAt: true,
    },
  });
  if (!grant) throw new QQH5Error("GRANT_UNAVAILABLE", "绑定链接已过期、已使用或不属于当前账号", 410);

  return { maskedQQ: maskQQIdentity(assertIdentityGrant(grant)), expiresAt: grant.expiresAt };
}

export async function confirmQQBinding(userId: string, token: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const hash = tokenHash(token);
    const grant = await tx.qQGrant.findFirst({
      where: {
        ...buildQQGrantConsumeWhere(hash, "IDENTITY_BIND", now),
        OR: [{ userId: null }, { userId }],
      },
      select: {
        identityLookupHash: true,
        identityCiphertext: true,
        identityIv: true,
        identityAuthTag: true,
        identityKeyVersion: true,
      },
    });
    if (!grant) throw new QQH5Error("GRANT_UNAVAILABLE", "绑定链接已过期或已使用", 410);

    const identity = assertIdentityGrant(grant);
    const existing = await tx.qQIdentity.findFirst({
      where: { OR: [{ userId }, { lookupHash: grant.identityLookupHash! }] },
      select: { userId: true },
    });
    if (existing) {
      throw new QQH5Error(
        existing.userId === userId ? "USER_ALREADY_BOUND" : "QQ_ALREADY_BOUND",
        existing.userId === userId ? "当前账号已经绑定 QQ" : "该 QQ 已绑定其他账号",
        409,
      );
    }

    const consumed = await tx.qQGrant.updateMany({
      where: {
        ...buildQQGrantConsumeWhere(hash, "IDENTITY_BIND", now),
        OR: [{ userId: null }, { userId }],
      },
      data: { consumedAt: now, userId },
    });
    if (consumed.count !== 1) throw new QQH5Error("GRANT_UNAVAILABLE", "绑定链接已被使用", 409);

    await tx.qQIdentity.create({
      data: {
        userId,
        lookupHash: grant.identityLookupHash!,
        ciphertext: grant.identityCiphertext!,
        iv: grant.identityIv!,
        authTag: grant.identityAuthTag!,
        keyVersion: grant.identityKeyVersion!,
      },
    });
    await tx.user.update({ where: { id: userId }, data: { securityVersion: { increment: 1 } } });
    await tx.auditLog.create({
      data: {
        operatorId: userId,
        action: "QQ_IDENTITY_BIND",
        targetType: "USER",
        targetId: userId,
        details: { source: "QQ_H5_GRANT" },
      },
    });
    return { maskedQQ: maskQQIdentity(identity) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function parseDraftRecord(record: { payload: Prisma.JsonValue; payloadHash: string }) {
  let draft: QQDelegationDraft;
  try {
    draft = validateQQDelegationDraft(record.payload);
  } catch {
    throw new QQH5Error("DRAFT_INVALID", "委托草稿格式无效，请返回 QQ 重新生成", 409);
  }
  const hash = hashQQDelegationDraft(draft);
  if (hash !== record.payloadHash) {
    throw new QQH5Error("DRAFT_CHANGED", "委托草稿校验失败，请返回 QQ 重新生成", 409);
  }
  return { draft, payloadHash: hash };
}

export async function previewQQDraft(userId: string, token: string) {
  const now = new Date();
  const grant = await prisma.qQGrant.findFirst({
    where: { ...activeGrantWhere(token, "DELEGATION_SUBMIT", now), userId },
    select: {
      expiresAt: true,
      draft: { select: { ownerId: true, payload: true, payloadHash: true, expiresAt: true, finalizedAt: true } },
    },
  });
  if (
    !grant?.draft ||
    grant.draft.ownerId !== userId ||
    grant.draft.finalizedAt ||
    (grant.draft.expiresAt && grant.draft.expiresAt <= now)
  ) {
    throw new QQH5Error("DRAFT_UNAVAILABLE", "委托确认链接已过期、已使用或不属于当前账号", 410);
  }
  const parsed = parseDraftRecord(grant.draft);
  return { ...parsed, expiresAt: grant.expiresAt };
}

function buildCaseData(draft: QQDelegationDraft) {
  const contentType = CONTENT_TYPE_LABELS[draft.contentType];
  const formData: DelegationFormData = {
    contentType,
    schoolName: draft.schoolName,
    schoolCategory: draft.schoolCategory,
    schoolType: draft.schoolType,
    schoolAddress: draft.schoolAddress,
    reportChannels: draft.reportChannels ?? "",
    description: draft.description,
    feeStatus: draft.feeStatus,
    feeDetails: draft.feeDetails,
    demands: draft.demands,
    otherDemand: draft.otherDemand,
  };
  const pledgeText = formatDelegation(formData);
  const input: DelegationInput = {
    ...formData,
    pledgeText,
    grade: draft.grade,
    timeRange: draft.timeRange,
    province: draft.province,
    city: draft.city,
    expectedHelperProvince: draft.expectedHelperProvince,
    riskPreference: draft.riskPreference,
  };
  const extraction = extractFields(input);
  const rawText = `${Object.values(formData).join(" ")} ${pledgeText}`;
  return { formData, pledgeText, extraction, review: reviewDelegation(extraction, rawText), rawText };
}

export async function submitQQDraft(
  userId: string,
  token: string,
  expectedPayloadHash: string,
  confirmations: boolean[],
) {
  if (confirmations.length !== 3 || confirmations.some((value) => value !== true)) {
    throw new QQH5Error("CONFIRMATIONS_REQUIRED", "请逐项确认全部三项声明", 400);
  }

  const preview = await previewQQDraft(userId, token);
  if (preview.payloadHash !== expectedPayloadHash) {
    throw new QQH5Error("DRAFT_CHANGED", "草稿已更新，请重新核对全部内容", 409);
  }
  const prepared = buildCaseData(preview.draft);
  const sensitiveMatches = await scanContent(prepared.rawText);
  if (sensitiveMatches.length > 0) {
    throw new QQH5Error(
      "SENSITIVE_CONTENT",
      `检测到 ${sensitiveMatches.length} 处敏感或可识别信息，请返回 QQ 修改草稿后重试`,
      422,
    );
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const hash = tokenHash(token);
    const grant = await tx.qQGrant.findFirst({
      where: { ...buildQQGrantConsumeWhere(hash, "DELEGATION_SUBMIT", now), userId },
      select: {
        draftId: true,
        draft: { select: { ownerId: true, payload: true, payloadHash: true, expiresAt: true, finalizedAt: true } },
      },
    });
    if (
      !grant?.draftId ||
      !grant.draft ||
      grant.draft.ownerId !== userId ||
      grant.draft.finalizedAt ||
      (grant.draft.expiresAt && grant.draft.expiresAt <= now)
    ) {
      throw new QQH5Error("DRAFT_UNAVAILABLE", "委托确认链接已过期或已使用", 410);
    }
    const current = parseDraftRecord(grant.draft);
    if (current.payloadHash !== expectedPayloadHash || current.payloadHash !== preview.payloadHash) {
      throw new QQH5Error("DRAFT_CHANGED", "草稿已更新，请重新核对全部内容", 409);
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, phone: true, quizPassed: true, dcrAccess: true, dcrContributionAccess: true },
    });
    if (!user) throw new QQH5Error("USER_NOT_FOUND", "用户不存在", 404);
    const hasDelegationCapability = canSubmitDcrDelegation(user);
    if (!hasDelegationCapability) await reconcileRejectedDcrApplications(tx, userId);
    const pending = hasDelegationCapability ? null : await tx.accessApplication.findFirst({
      where: { applicantId: userId, type: "DCR", status: "PENDING" },
      select: { id: true },
    });
    const admission = hasDelegationCapability ? { allowed: true as const } : evaluateDcrAdmission({
      stage: "SUBMIT_CASE",
      user,
      hasOtherPendingApplication: Boolean(pending),
    });
    if (!admission.allowed) {
      throw new QQH5Error(admission.code, admission.reason, admission.code === "APPLICATION_ALREADY_PENDING" ? 409 : 403, admission.next);
    }

    const consumed = await tx.qQGrant.updateMany({
      where: { ...buildQQGrantConsumeWhere(hash, "DELEGATION_SUBMIT", now), userId, draftId: grant.draftId },
      data: { consumedAt: now },
    });
    const finalized = await tx.qQDelegationDraft.updateMany({
      where: {
        id: grant.draftId,
        ownerId: userId,
        payloadHash: expectedPayloadHash,
        finalizedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { finalizedAt: now },
    });
    if (consumed.count !== 1 || finalized.count !== 1) {
      throw new QQH5Error("DRAFT_UNAVAILABLE", "委托草稿已被提交", 409);
    }

    const createdCase = await tx.case.create({
      data: {
        category: current.draft.contentType,
        formData: prepared.formData as unknown as Prisma.InputJsonValue,
        pledgeText: prepared.pledgeText,
        status: "OPENED",
        requestStatus: "PENDING",
        reviewNote: "委托已提交，正在等待管理员审核",
        extractedFields: prepared.extraction.extractedFields as Prisma.InputJsonValue,
        missingFields: prepared.extraction.missingFields,
        sensitiveHitCount: 0,
        grade: current.draft.grade,
        timeRange: current.draft.timeRange,
        province: current.draft.province,
        city: current.draft.city,
        expectedHelperProvince: current.draft.expectedHelperProvince,
        riskPreference: current.draft.riskPreference,
        submitterId: userId,
        timeline: {
          create: {
            action: "委托创建",
            newStatus: "OPENED",
            details: "经 QQ 草稿最终确认提交，正在等待管理员审核",
          },
        },
      },
      select: { id: true, category: true },
    });

    if (!user.dcrAccess && !user.dcrContributionAccess) {
      const applicationAdmission = evaluateDcrAdmission({
        stage: "CREATE_APPLICATION",
        user,
        case: { id: createdCase.id, submitterId: userId, requestStatus: "PENDING" },
        hasOtherPendingApplication: false,
      });
      if (!applicationAdmission.allowed) {
        throw new QQH5Error(applicationAdmission.code, applicationAdmission.reason, 403, applicationAdmission.next);
      }
      await tx.accessApplication.create({
        data: {
          type: "DCR",
          status: "PENDING",
          pledgeText: prepared.pledgeText,
          applicantId: userId,
          caseId: createdCase.id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        operatorId: userId,
        action: "CREATE_CASE",
        targetType: "CASE",
        targetId: createdCase.id,
        details: {
          source: "QQ_H5_DELEGATION",
          requestStatus: "PENDING",
          automatedSuggestion: prepared.review.decision,
          missingFields: prepared.extraction.missingFields,
        },
      },
    });
    return { caseId: createdCase.id, category: createdCase.category, caseUrl: `/dcr/tickets/${createdCase.id}` };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function previewQQCaseReview(userId: string, token: string, consume = false) {
  const now = new Date();
  const hash = tokenHash(token);
  return prisma.$transaction(async (tx) => {
    const grant = await tx.qQGrant.findFirst({
      where: { ...buildQQGrantConsumeWhere(hash, "CASE_REVIEW", now), userId },
      select: { targetId: true, expiresAt: true },
    });
    if (!grant?.targetId) throw new QQH5Error("GRANT_UNAVAILABLE", "审核链接已过期、已使用或不属于当前账号", 410);

    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !hasMinimumRole(user.role, "MODERATOR")) {
      throw new QQH5Error("REVIEW_FORBIDDEN", "当前账号不再具有委托审核权限", 403);
    }
    const caseRecord = await tx.case.findUnique({
      where: { id: grant.targetId },
      select: { id: true, category: true, requestStatus: true },
    });
    if (!caseRecord) throw new QQH5Error("CASE_NOT_FOUND", "委托不存在", 404);

    if (consume) {
      const consumed = await tx.qQGrant.updateMany({
        where: { ...buildQQGrantConsumeWhere(hash, "CASE_REVIEW", now), userId, targetId: caseRecord.id },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new QQH5Error("GRANT_UNAVAILABLE", "审核链接已被使用", 409);
    }
    return {
      caseId: caseRecord.id,
      category: caseRecord.category,
      requestStatus: caseRecord.requestStatus,
      expiresAt: grant.expiresAt,
      reviewUrl: `/admin/dcr/reviews?requestStatus=${caseRecord.requestStatus}`,
      consumed: consume,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const ACTIVE_TASK_STATUSES = [
  TaskStatus.OPEN,
  TaskStatus.CLAIMED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.EVIDENCE_PENDING,
] as const;

export async function previewQQTaskPublish(userId: string, token: string) {
  const grant = await prisma.qQGrant.findFirst({
    where: { ...activeGrantWhere(token, "TASK_PUBLISH"), userId },
    select: { targetId: true, expiresAt: true },
  });
  if (!grant?.targetId) throw new QQH5Error("GRANT_UNAVAILABLE", "发布链接已过期、已使用或不属于当前账号", 410);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dcrAccess: true } });
  if (!user?.dcrAccess) throw new QQH5Error("DCR_ACCESS_REQUIRED", "当前账号没有 DCR 区访问权限", 403);
  const caseRecord = await prisma.case.findUnique({
    where: { id: grant.targetId },
    select: {
      id: true,
      category: true,
      requestStatus: true,
      submitterId: true,
      mutualAidTasks: {
        where: { status: { in: [...ACTIVE_TASK_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
  if (!caseRecord) throw new QQH5Error("CASE_NOT_FOUND", "委托不存在", 404);
  if (caseRecord.submitterId !== userId) throw new QQH5Error("PUBLISH_FORBIDDEN", "只能发布本人提交的委托", 403);
  if (caseRecord.requestStatus !== "APPROVED") throw new QQH5Error("CASE_NOT_APPROVED", "委托当前未处于审核通过状态", 409);
  return {
    caseId: caseRecord.id,
    category: caseRecord.category,
    publicCopy: getPublicDcrTaskCopy(caseRecord.category),
    activeTask: caseRecord.mutualAidTasks[0] ?? null,
    expiresAt: grant.expiresAt,
  };
}

export async function confirmQQTaskPublish(userId: string, token: string) {
  const now = new Date();
  const hash = tokenHash(token);
  return runSerializableTransaction(async (tx) => {
    const grant = await tx.qQGrant.findFirst({
      where: { ...buildQQGrantConsumeWhere(hash, "TASK_PUBLISH", now), userId },
      select: { targetId: true },
    });
    if (!grant?.targetId) throw new QQH5Error("GRANT_UNAVAILABLE", "发布链接已过期或已使用", 410);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { dcrAccess: true } });
    if (!user?.dcrAccess) throw new QQH5Error("DCR_ACCESS_REQUIRED", "当前账号没有 DCR 区访问权限", 403);
    const caseRecord = await tx.case.findUnique({
      where: { id: grant.targetId },
      select: { id: true, category: true, submitterId: true, requestStatus: true },
    });
    if (!caseRecord) throw new QQH5Error("CASE_NOT_FOUND", "委托不存在", 404);
    if (caseRecord.submitterId !== userId) throw new QQH5Error("PUBLISH_FORBIDDEN", "只能发布本人提交的委托", 403);
    if (caseRecord.requestStatus !== "APPROVED") throw new QQH5Error("CASE_NOT_APPROVED", "委托当前未处于审核通过状态", 409);

    const existing = await tx.mutualAidTask.findFirst({
      where: { requesterId: userId, caseId: caseRecord.id, status: { in: [...ACTIVE_TASK_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    const consumed = await tx.qQGrant.updateMany({
      where: { ...buildQQGrantConsumeWhere(hash, "TASK_PUBLISH", now), userId, targetId: caseRecord.id },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new QQH5Error("GRANT_UNAVAILABLE", "发布链接已被使用", 409);
    if (existing) return { task: existing, existing: true, reusedApprovedCase: true };

    const task = await tx.mutualAidTask.create({
      data: {
        ...getPublicDcrTaskCopy(caseRecord.category),
        category: caseRecord.category,
        urgencyLevel: UrgencyLevel.MEDIUM,
        status: TaskStatus.OPEN,
        requesterId: userId,
        caseId: caseRecord.id,
        structuredFields: { source: "APPROVED_DELEGATION_CASE", channel: "QQ_H5" } as Prisma.InputJsonValue,
        timeline: {
          create: {
            action: "publish_from_approved_case",
            newStatus: TaskStatus.OPEN,
            details: "经 QQ H5 确认，复用已审核委托发布安全公开任务",
            operatorId: userId,
          },
        },
      },
      select: { id: true, status: true },
    });
    await tx.auditLog.create({
      data: {
        operatorId: userId,
        action: "PUBLISH_TASK_FROM_APPROVED_CASE",
        targetType: "TASK",
        targetId: task.id,
        details: { caseId: caseRecord.id, status: task.status, source: "QQ_H5" },
      },
    });
    return { task, existing: false, reusedApprovedCase: true };
  });
}

export function qqRouteError(error: unknown): NextResponse {
  if (error instanceof QQH5Error) {
    return qqNoStoreJson({ error: error.message, code: error.code, next: error.next }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return qqNoStoreJson({ error: "QQ 或账号已被绑定", code: "BINDING_CONFLICT" }, { status: 409 });
    if (error.code === "P2034") return qqNoStoreJson({ error: "操作发生并发冲突，请重试", code: "TRANSACTION_CONFLICT" }, { status: 409 });
  }
  if (error instanceof SerializableTransactionConflict) {
    return qqNoStoreJson({ error: "操作发生并发冲突，请重试", code: "TRANSACTION_CONFLICT" }, { status: 409 });
  }
  return qqNoStoreJson({ error: "服务器内部错误" }, { status: 500 });
}
