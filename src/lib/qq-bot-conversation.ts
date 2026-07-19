import { createHash } from "node:crypto";
import { validateQQDelegationDraft } from "@/lib/qq-delegation";

export const QQ_FORM_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const QQ_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type Payload = Record<string, unknown>;

interface FormStep {
  key: string;
  prompt: string;
  parse: (answer: string, payload: Payload) => unknown;
}

function required(max: number, minimum = 1): FormStep["parse"] {
  return (answer) => {
    const value = answer.trim();
    if (value.length < minimum || value.length > max) {
      throw new Error(`请输入 ${minimum}-${max} 个字符。`);
    }
    return value;
  };
}

function optional(max: number): FormStep["parse"] {
  return (answer) => {
    const value = answer.trim();
    if (value === "无") return null;
    if (!value || value.length > max) throw new Error(`请输入不超过 ${max} 个字符，或回复“无”。`);
    return value;
  };
}

function choice<T extends string>(choices: Record<string, T>, hint: string): FormStep["parse"] {
  return (answer) => {
    const value = choices[answer.trim()];
    if (!value) throw new Error(`格式不正确。${hint}`);
    return value;
  };
}

export const QQ_DELEGATION_STEPS: readonly FormStep[] = [
  {
    key: "contentType",
    prompt: "请选择内容类型：1 学校补课，2 提前开学，3 不双休，4 校外培训，5 其他。",
    parse: choice(
      { "1": "TUTORING", "学校补课": "TUTORING", "2": "EARLY_START", "提前开学": "EARLY_START", "3": "NO_WEEKENDS", "不双休": "NO_WEEKENDS", "4": "EXTERNAL_TRAINING", "校外培训": "EXTERNAL_TRAINING", "5": "OTHER", "其他": "OTHER" },
      "请回复 1-5。",
    ),
  },
  { key: "schoolName", prompt: "请填写学校或机构全称。", parse: required(200) },
  {
    key: "schoolCategory",
    prompt: "请选择学校性质：1 公立学历制学校，2 私立学历制学校，3 校外培训机构。",
    parse: choice(
      { "1": "公立学历制学校", "公立学历制学校": "公立学历制学校", "2": "私立学历制学校", "私立学历制学校": "私立学历制学校", "3": "校外培训机构", "校外培训机构": "校外培训机构" },
      "请回复 1-3。",
    ),
  },
  { key: "schoolType", prompt: "请填写学校类型，例如高级中学、普通高校或校外培训机构。", parse: required(100) },
  { key: "schoolAddress", prompt: "请填写学校或机构的详细地址。", parse: required(500) },
  { key: "reportChannels", prompt: "请填写已经尝试的举报渠道；没有请回复“无”。", parse: optional(500) },
  { key: "description", prompt: "请详细描述事实经过、时间和涉及对象（至少 20 字）。", parse: required(5_000, 20) },
  {
    key: "feeStatus",
    prompt: "请选择收费情况：1 未收费，2 已收费，3 不清楚。",
    parse: choice({ "1": "none", "未收费": "none", "2": "charged", "已收费": "charged", "3": "unknown", "不清楚": "unknown" }, "请回复 1-3。"),
  },
  {
    key: "feeDetails",
    prompt: "请填写收费金额、方式等信息；未收费或不清楚请回复“无”。",
    parse: (answer, payload) => {
      const value = optional(1_000)(answer, payload);
      if (payload.feeStatus === "charged" && value === null) throw new Error("已收费时必须填写收费详情。");
      return value;
    },
  },
  {
    key: "demands",
    prompt: "请填写诉求，多项用中文逗号分隔，例如：停止补课，退还费用。",
    parse: (answer) => {
      const values = [...new Set(answer.split(/[，,]/).map((item) => item.trim()).filter(Boolean))];
      if (values.length < 1 || values.length > 20 || values.some((item) => item.length > 200)) {
        throw new Error("请填写 1-20 项诉求，每项不超过 200 字，并用逗号分隔。");
      }
      return values;
    },
  },
  { key: "otherDemand", prompt: "如有其他诉求请填写；没有请回复“无”。", parse: optional(1_000) },
  { key: "grade", prompt: "请填写涉及年级；不确定请回复“无”。", parse: optional(20) },
  { key: "timeRange", prompt: "请填写事件发生的时间范围；不确定请回复“无”。", parse: optional(200) },
  { key: "province", prompt: "请填写事件所在省份。", parse: required(50) },
  { key: "city", prompt: "请填写事件所在城市。", parse: required(50) },
  { key: "expectedHelperProvince", prompt: "请填写期望互助人省份；无偏好请回复“无”。", parse: optional(50) },
  {
    key: "riskPreference",
    prompt: "请选择风险偏好：1 仅站内沟通，2 可电话，3 仅模板咨询。",
    parse: choice({ "1": "仅站内沟通", "仅站内沟通": "仅站内沟通", "2": "可电话", "可电话": "可电话", "3": "仅模板咨询", "仅模板咨询": "仅模板咨询" }, "请回复 1-3。"),
  },
] as const;

export function getQQDelegationPrompt(step: number): FormStep | null {
  return QQ_DELEGATION_STEPS[step] ?? null;
}

export function applyQQDelegationAnswer(step: number, payload: Payload, answer: string): Payload {
  const current = getQQDelegationPrompt(step);
  if (!current) throw new Error("当前表单已填写完成。");
  return { ...payload, [current.key]: current.parse(answer, payload) };
}

export function buildCanonicalQQDraft(payload: Payload): { payload: Payload; canonical: string; hash: string } {
  const core = validateQQDelegationDraft({
    schemaVersion: 1,
    contentType: payload.contentType,
    schoolName: payload.schoolName,
    schoolCategory: payload.schoolCategory,
    schoolType: payload.schoolType,
    schoolAddress: payload.schoolAddress,
    reportChannels: payload.reportChannels ?? undefined,
    description: payload.description,
    feeStatus: payload.feeStatus,
    feeDetails: payload.feeDetails ?? undefined,
    demands: payload.demands,
    otherDemand: payload.otherDemand ?? undefined,
    grade: payload.grade ?? undefined,
    timeRange: payload.timeRange ?? undefined,
    province: payload.province,
    city: payload.city,
    expectedHelperProvince: payload.expectedHelperProvince ?? undefined,
    riskPreference: payload.riskPreference,
  });
  const complete: Payload = {
    schemaVersion: core.schemaVersion,
    contentType: core.contentType,
    schoolName: core.schoolName,
    schoolCategory: core.schoolCategory,
    schoolType: core.schoolType,
    schoolAddress: core.schoolAddress,
    reportChannels: core.reportChannels ?? null,
    description: core.description,
    feeStatus: core.feeStatus,
    feeDetails: core.feeDetails ?? null,
    demands: core.demands,
    otherDemand: core.otherDemand ?? null,
    grade: core.grade ?? null,
    timeRange: core.timeRange ?? null,
    province: core.province,
    city: core.city,
    expectedHelperProvince: core.expectedHelperProvince ?? null,
    riskPreference: core.riskPreference,
  };
  const canonical = JSON.stringify(complete);
  return {
    payload: complete,
    canonical,
    hash: createHash("sha256").update(canonical, "utf8").digest("base64url"),
  };
}
