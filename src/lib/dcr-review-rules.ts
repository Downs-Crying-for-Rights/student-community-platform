/**
 * DCR 委托表审核规则引擎
 *
 * 根据抽取结果 & 原始文本，判定委托表应进入哪个审核状态：
 *   APPROVED / NEED_MORE_INFO / REJECTED / MANUAL_REVIEW
 *
 * 纯函数设计，无副作用，便于测试。
 */

import type { ExtractionResult } from "./dcr-field-extractor";
import { hasAttitudePhrases, hasMultipleSchools, isOnlyLinkOrTooShort } from "./dcr-field-extractor";

/* ========== Types ========== */

export type ReviewDecision =
  | "APPROVED"
  | "NEED_MORE_INFO"
  | "REJECTED"
  | "MANUAL_REVIEW";

export interface ReviewResult {
  decision: ReviewDecision;
  /** 审核理由 (用于展示给用户/管理员) */
  reason: string;
  /** 需补充的字段清单 (仅 NEED_MORE_INFO 时有值) */
  missingFields: string[];
  /** 命中硬规则的警告列表 */
  warnings: string[];
}

/* ========== Constants ========== */

/** 判定是否为委托表的最低要素数量 */
const MIN_REQUIRED_ELEMENTS = 3;

/** 哪些 extractedFields key 算"关键要素" */
const KEY_ELEMENTS = [
  "schoolName",
  "typeCategory",
  "grade",
  "timeRange",
  "feeStatus",
  "reportChannel",
  "pledge",
];

/* ========== Core Logic ========== */

/**
 * 执行审核判定，返回审核结果。
 *
 * 规则优先级:
 * 1. 仅链接或字数 < 80 → REJECTED
 * 2. 多校 → REJECTED
 * 3. 非补课类 ("其他") → MANUAL_REVIEW
 * 4. 态度句命中 → NEED_MORE_INFO
 * 5. 关键要素 < 3 → NEED_MORE_INFO (不是委托表)
 * 6. 有缺项 → NEED_MORE_INFO
 * 7. 缺项为空且无警告 → APPROVED
 */
export function reviewDelegation(
  extraction: ExtractionResult,
  rawText: string,
): ReviewResult {
  const { extractedFields, missingFields, log } = extraction;
  const warnings: string[] = [...log];

  // ---- 规则1: 仅链接或字数不足 → REJECTED ----
  const { onlyLink, tooShort } = isOnlyLinkOrTooShort(rawText);
  if (onlyLink) {
    return {
      decision: "REJECTED",
      reason: "委托表内容仅为链接，请填写具体文字内容后重新提交",
      missingFields: [],
      warnings,
    };
  }
  if (tooShort) {
    return {
      decision: "REJECTED",
      reason: `委托表内容字数不足 (当前 ${rawText.trim().length} 字，需要至少 80 字)，请补充详细描述后重新提交`,
      missingFields: [],
      warnings,
    };
  }

  // ---- 规则2: 多校 → REJECTED ----
  if (hasMultipleSchools(rawText)) {
    warnings.push("检测到多个学校名称，一次仅限一所学校");
    return {
      decision: "REJECTED",
      reason: "检测到多个学校名称，每次委托仅限提交一所学校的信息",
      missingFields: [],
      warnings,
    };
  }

  // ---- 规则3: 非补课类 → MANUAL_REVIEW ----
  if (missingFields.includes("类型为'其他'，需转人工审核")) {
    return {
      decision: "MANUAL_REVIEW",
      reason: "委托类型为'其他'，不属于标准补课类，已转人工审核",
      missingFields: [],
      warnings,
    };
  }

  // ---- 规则4: 态度句 → NEED_MORE_INFO ----
  if (hasAttitudePhrases(rawText)) {
    return {
      decision: "NEED_MORE_INFO",
      reason: "检测到'请通过''给我链接'等态度句。委托表应以事实描述为主，请移除态度句后重新提交",
      missingFields,
      warnings,
    };
  }

  // ---- 规则5: 关键要素 < 3 → NEED_MORE_INFO (不是委托表) ----
  const keyElementCount = KEY_ELEMENTS.filter((k) => k in extractedFields).length;
  if (keyElementCount < MIN_REQUIRED_ELEMENTS) {
    return {
      decision: "NEED_MORE_INFO",
      reason: `当前仅识别到 ${keyElementCount} 个关键要素 (需要至少 ${MIN_REQUIRED_ELEMENTS} 个)。请按委托表格式补充：学校名称、补课类型、年级、时间信息、收费情况、举报途径、真实性承诺`,
      missingFields,
      warnings,
    };
  }

  // ---- 规则6: 有缺项 → NEED_MORE_INFO ----
  if (missingFields.length > 0) {
    return {
      decision: "NEED_MORE_INFO",
      reason: `以下信息缺失或未正确填写: ${missingFields.join("、")}`,
      missingFields,
      warnings,
    };
  }

  // ---- 规则7: 无缺项 → APPROVED ----
  return {
    decision: "APPROVED",
    reason: "委托表字段完整，审核通过",
    missingFields: [],
    warnings,
  };
}

/* ========== Admin Review Helpers ========== */

/** 管理员驳回话术模板 */
export const REJECTION_TEMPLATES: Record<string, string> = {
  onlyLink: "委托表仅包含链接，未填写实质性内容。请用文字描述学校及补课情况后重新提交。",
  tooShort: "委托表内容过短，缺少必要的委托信息。请补充学校名称、补课类型、年级、时间、举报途径、收费情况等关键信息。",
  multiSchool: "检测到多所学校信息，每次委托仅限提交一所学校的情况。请分别提交。",
  nonTuition: "该委托不属于补课相关类型，已转人工处理。",
  attitude: "委托表包含'请通过''审核通过'等态度句，请删除这些语句，仅保留事实描述后重新提交。",
};

/** 管理员申请补充话术模板 */
export const NEED_MORE_INFO_TEMPLATE = "请补充以下缺失信息后重新提交：";

/** 管理员审核通过话术模板 */
export const APPROVED_TEMPLATE = "您的委托表已通过审核，进入匹配队列。互助人将在看到脱敏信息后联系您。请注意：切勿交换手机号、真实姓名、家庭住址等可识别信息。";
