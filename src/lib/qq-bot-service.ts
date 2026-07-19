import { Prisma, type QQConversationState } from "@prisma/client";
import { getQQConfig } from "@/lib/qq-config";
import { encryptQQIdentity, hashQQIdentity, normalizeQQIdentity } from "@/lib/qq-identity";
import { generateQQGrant, hashQQGrant } from "@/lib/qq-grants";
import { runSerializableTransaction } from "@/lib/serializable-transaction";
import prisma from "@/lib/prisma";
import { scanContent } from "@/lib/sensitive-engine";
import {
  buildCanonicalQQDraft,
  parseQQDelegationForm,
  QQ_DELEGATION_TEMPLATE,
  QQ_DRAFT_TTL_MS,
  QQ_FORM_TTL_MS,
  validateQQDelegationRequirements,
} from "@/lib/qq-bot-conversation";
import { reviewQQDraftWithAi } from "@/lib/qq-draft-ai-review";
import type { QQBotMessage, QQBotResponse } from "@/lib/qq-bot-contract";

const SITE_ORIGIN = "https://forum.dcr2026.com";
const HELP = "可用命令：帮助、绑定、状态、新建委托、取消、草稿。发送“新建委托”获取完整模板，填写后一次发送。";
const AI_NOTICE = "本回复由 AI 辅助生成，仅作信息整理，不表达任何观点或立场，AI 输出与 DCR 无关；最终结果以网页确认和管理员人工审核为准。";

interface DraftPreflight {
  payload?: Record<string, unknown>;
  error?: string;
  issues: string[];
}

function response(
  replies: string[],
  state: QQBotResponse["conversation"]["state"],
  revision: number | string,
  prompt: string | null,
): QQBotResponse {
  return { duplicate: false, replies, conversation: { state, revision: String(revision), prompt } };
}

function storedResponse(value: Prisma.JsonValue): QQBotResponse {
  return { ...(value as unknown as QQBotResponse), duplicate: true };
}

function stateName(state: QQConversationState | undefined): QQBotResponse["conversation"]["state"] {
  if (state === "DELEGATION_FORM") return "delegation_form";
  if (state === "DRAFT_READY") return "draft";
  return "idle";
}

async function createBinding(tx: Prisma.TransactionClient, qq: string): Promise<QQBotResponse> {
  const config = getQQConfig();
  const encrypted = encryptQQIdentity(qq, config.identityEncryptionKey, config.keyVersion);
  const token = generateQQGrant();
  await tx.qQGrant.create({
    data: {
      tokenHash: hashQQGrant(token, config.grantHmacKey),
      purpose: "IDENTITY_BIND",
      expiresAt: new Date(Date.now() + config.grantTtlSeconds * 1_000),
      identityLookupHash: hashQQIdentity(qq, config.identityHmacKey),
      identityCiphertext: encrypted.ciphertext,
      identityIv: encrypted.iv,
      identityAuthTag: encrypted.authTag,
      identityKeyVersion: encrypted.keyVersion,
    },
  });
  return response([`请在浏览器中完成账号绑定：${SITE_ORIGIN}/qq/bind?token=${encodeURIComponent(token)}`], "binding", 1, null);
}

async function issueDraftLink(
  tx: Prisma.TransactionClient,
  userId: string,
  draftId: string,
  revision: number,
): Promise<QQBotResponse> {
  const config = getQQConfig();
  const token = generateQQGrant();
  await tx.qQGrant.create({
    data: {
      tokenHash: hashQQGrant(token, config.grantHmacKey),
      purpose: "DELEGATION_SUBMIT",
      userId,
      draftId,
      expiresAt: new Date(Date.now() + QQ_DRAFT_TTL_MS),
    },
  });
  return response(
    [`委托草稿已保存 7 天。请在网页中核对信息并完成必要确认后提交：${SITE_ORIGIN}/qq/draft?token=${encodeURIComponent(token)}`],
    "draft",
    revision,
    null,
  );
}

async function processBound(
  tx: Prisma.TransactionClient,
  message: QQBotMessage,
  user: { id: string; isBanned: boolean },
  answerHasSensitiveContent: boolean,
  draftPreflight: DraftPreflight | null,
): Promise<QQBotResponse> {
  const conversation = await tx.qQConversation.findUnique({ where: { ownerId: user.id } });
  const active = conversation && conversation.expiresAt > new Date() ? conversation : null;
  const state = stateName(active?.state);
  const revision = active?.revision ?? 0;

  if (message.input.type === "command") {
    if (message.input.command === "帮助") return response([HELP], state, revision, active?.state === "DELEGATION_FORM" ? "complete_form" : null);
    if (message.input.command === "绑定") return response(["当前 QQ 已绑定账号，无需重复绑定。"], state, revision, active?.state === "DELEGATION_FORM" ? "complete_form" : null);

    if (message.input.command === "状态") {
      const [account, application, caseCount, draftCount] = await Promise.all([
        tx.user.findUnique({
          where: { id: user.id },
          select: { role: true, phone: true, quizPassed: true, dcrAccess: true, dcrPledgeSigned: true },
        }),
        tx.accessApplication.findFirst({
          where: { applicantId: user.id, type: "DCR" },
          orderBy: { createdAt: "desc" },
          select: { status: true },
        }),
        tx.case.count({ where: { submitterId: user.id } }),
        tx.qQDelegationDraft.count({ where: { ownerId: user.id, finalizedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
      ]);
      const formStatus = active?.state === "DELEGATION_FORM"
        ? "等待完整模板"
        : active?.state === "DRAFT_READY" ? "草稿待网页确认" : "无进行中的表单";
      const accessGranted = account?.role === "ADMIN"
        || account?.role === "SUPER_ADMIN"
        || Boolean(account?.dcrAccess && account.dcrPledgeSigned);
      return response([
        `账号状态：已绑定\n手机号：${account?.phone ? "已验证" : "未验证"}\n入频考核：${account?.quizPassed ? "已通过" : "未通过"}\nDCR 权限：${accessGranted ? "已生效" : "未生效"}\n最近申请：${application?.status ?? "无"}\n委托数量：${caseCount}\n可用草稿：${draftCount}\nQQ 表单：${formStatus}`,
      ], state, revision, active?.state === "DELEGATION_FORM" ? "complete_form" : null);
    }

    if (user.isBanned) return response(["账号当前不可用，请联系管理员。"], state, revision, null);

    if (message.input.command === "取消") {
      if (!active || active.state === "IDLE") return response(["当前没有进行中的 QQ 表单。"], "idle", revision, null);
      const saved = await tx.qQConversation.upsert({
        where: { ownerId: user.id },
        create: { ownerId: user.id, state: "IDLE", step: 0, payload: {}, expiresAt: new Date(Date.now() + QQ_FORM_TTL_MS) },
        update: { state: "IDLE", step: 0, payload: {}, revision: { increment: 1 }, expiresAt: new Date(Date.now() + QQ_FORM_TTL_MS) },
      });
      return response(["已取消当前 QQ 表单。已保存的网页草稿不会被提交。"], "idle", saved.revision, null);
    }

    if (message.input.command === "新建委托") {
      if (active?.state === "DELEGATION_FORM") {
        return response([`继续填写上次委托。\n${QQ_DELEGATION_TEMPLATE}`], "delegation_form", active.revision, "complete_form");
      }
      const saved = await tx.qQConversation.upsert({
        where: { ownerId: user.id },
        create: { ownerId: user.id, state: "DELEGATION_FORM", step: 0, payload: {}, expiresAt: new Date(Date.now() + QQ_FORM_TTL_MS) },
        update: { state: "DELEGATION_FORM", step: 0, payload: {}, revision: { increment: 1 }, expiresAt: new Date(Date.now() + QQ_FORM_TTL_MS) },
      });
      return response([QQ_DELEGATION_TEMPLATE], "delegation_form", saved.revision, "complete_form");
    }

    if (message.input.command === "草稿") {
      if (active?.state === "DELEGATION_FORM") {
        return response([`当前正在等待完整模板，请填写后一次发送。\n${QQ_DELEGATION_TEMPLATE}`], "delegation_form", active.revision, "complete_form");
      }
      const draft = await tx.qQDelegationDraft.findFirst({
        where: { ownerId: user.id, finalizedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (!draft) return response(["当前没有可用草稿。发送“新建委托”开始填写。"], "idle", revision, null);
      return issueDraftLink(tx, user.id, draft.id, revision || 1);
    }
  }

  if (user.isBanned) return response(["账号当前不可用，请联系管理员。"], state, revision, null);
  if (!active || active.state !== "DELEGATION_FORM") return response(["当前没有等待回答的问题。发送“新建委托”开始，或发送“帮助”查看命令。"], state, revision, null);
  if (message.input.type !== "text") return response([HELP], state, revision, null);

  if (answerHasSensitiveContent) {
    return response(
      [`委托中检测到敏感内容或可识别个人信息，请移除后重新发送完整模板。\n${AI_NOTICE}`],
      "delegation_form",
      active.revision,
      "complete_form",
    );
  }
  if (!draftPreflight?.payload) {
    return response(
      [`${draftPreflight?.error ?? "委托格式不正确。"}\n请修改后重新发送完整模板。\n${AI_NOTICE}`],
      "delegation_form",
      active.revision,
      "complete_form",
    );
  }
  if (draftPreflight.issues.length > 0) {
    return response(
      [`薄荷预审发现以下内容需要补充：\n${draftPreflight.issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n")}\n请修改后重新发送完整模板。\n${AI_NOTICE}`],
      "delegation_form",
      active.revision,
      "complete_form",
    );
  }

  const payload = draftPreflight.payload;

  const canonical = buildCanonicalQQDraft(payload);
  const expiresAt = new Date(Date.now() + QQ_DRAFT_TTL_MS);
  const draft = await tx.qQDelegationDraft.create({
    data: { ownerId: user.id, schemaVersion: 1, payload: canonical.payload as Prisma.InputJsonValue, payloadHash: canonical.hash, expiresAt },
  });
  const saved = await tx.qQConversation.update({
    where: { ownerId: user.id },
    data: { state: "DRAFT_READY", step: 1, payload: canonical.payload as Prisma.InputJsonValue, revision: { increment: 1 }, expiresAt },
  });
  return issueDraftLink(tx, user.id, draft.id, saved.revision);
}

async function applyMessage(
  tx: Prisma.TransactionClient,
  message: QQBotMessage,
  lookupHash: string,
  answerHasSensitiveContent: boolean,
  draftPreflight: DraftPreflight | null,
): Promise<QQBotResponse> {
  const identity = await tx.qQIdentity.findUnique({
    where: { lookupHash },
    select: { user: { select: { id: true, isBanned: true } } },
  });
  if (!identity) {
    if (message.input.type === "command" && message.input.command === "帮助") return response([HELP], "idle", 1, null);
    if (message.input.type === "command" && message.input.command === "绑定") return createBinding(tx, message.userId);
    return response(["此 QQ 尚未绑定账号。请先发送“绑定”获取安全绑定链接。"], "idle", 1, null);
  }
  return processBound(tx, message, identity.user, answerHasSensitiveContent, draftPreflight);
}

async function prepareDraftPreflight(
  message: QQBotMessage,
  lookupHash: string,
  answerHasSensitiveContent: boolean,
): Promise<DraftPreflight | null> {
  if (message.input.type !== "text" || answerHasSensitiveContent) return null;
  const identity = await prisma.qQIdentity.findUnique({
    where: { lookupHash },
    select: { userId: true },
  });
  if (!identity) return null;
  const conversation = await prisma.qQConversation.findUnique({
    where: { ownerId: identity.userId },
    select: { state: true, expiresAt: true },
  });
  if (!conversation || conversation.state !== "DELEGATION_FORM" || conversation.expiresAt <= new Date()) return null;

  try {
    const payload = parseQQDelegationForm(message.input.text);
    const deterministicIssues = validateQQDelegationRequirements(payload);
    const aiIssues = deterministicIssues.length === 0
      ? await reviewQQDraftWithAi(payload, identity.userId)
      : [];
    return { payload, issues: [...new Set([...deterministicIssues, ...aiIssues])] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "委托格式不正确。", issues: [] };
  }
}

export async function processQQBotMessage(message: QQBotMessage): Promise<QQBotResponse> {
  const config = getQQConfig();
  const qq = normalizeQQIdentity(message.userId);
  const lookupHash = hashQQIdentity(qq, config.identityHmacKey);
  const existing = await prisma.qQBotEventInbox.findUnique({ where: { eventId: message.eventId }, select: { response: true } });
  if (existing?.response) return storedResponse(existing.response);
  const answerHasSensitiveContent = message.input.type === "text"
    && (await scanContent(message.input.text)).length > 0;
  const draftPreflight = await prepareDraftPreflight(message, lookupHash, answerHasSensitiveContent);

  try {
    return await runSerializableTransaction(async (tx) => {
      await tx.qQBotEventInbox.create({ data: { eventId: message.eventId, selfId: message.selfId, lookupHash } });
      const result = await applyMessage(tx, message, lookupHash, answerHasSensitiveContent, draftPreflight);
      await tx.qQBotEventInbox.update({
        where: { eventId: message.eventId },
        data: { response: result as unknown as Prisma.InputJsonValue, processedAt: new Date() },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.qQBotEventInbox.findUnique({ where: { eventId: message.eventId }, select: { response: true } });
      if (duplicate?.response) return storedResponse(duplicate.response);
    }
    throw error;
  }
}
