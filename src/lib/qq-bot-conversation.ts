import { createHash } from "node:crypto";
import { QQ_DELEGATION_SCHEMA_VERSION, validateQQDelegationDraft } from "@/lib/qq-delegation";

export const QQ_FORM_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const QQ_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type Payload = Record<string, unknown>;

interface FormField {
  label: string;
  key: string;
  parse: (answer: string, payload: Payload) => unknown;
  optional?: boolean;
}

function required(max: number, minimum = 1): FormField["parse"] {
  return (answer) => {
    const value = answer.trim();
    if (value.length < minimum || value.length > max) {
      throw new Error(`“${value.slice(0, 12) || "空值"}”应为 ${minimum}-${max} 个字符。`);
    }
    return value;
  };
}

function optional(max: number): FormField["parse"] {
  return (answer) => {
    const value = answer.trim();
    if (value === "无") return null;
    if (!value || value.length > max) throw new Error(`请输入不超过 ${max} 个字符，或填写“无”。`);
    return value;
  };
}

function choice<T extends string>(choices: Record<string, T>, hint: string): FormField["parse"] {
  return (answer) => {
    const value = choices[answer.trim()];
    if (!value) throw new Error(`格式不正确，${hint}`);
    return value;
  };
}

const FIELDS: readonly FormField[] = [
  {
    label: "内容类型",
    key: "contentType",
    parse: choice(
      { "学校补课": "TUTORING", "提前开学": "EARLY_START", "不双休": "NO_WEEKENDS", "校外培训": "EXTERNAL_TRAINING", "其他": "OTHER" },
      "请填写学校补课、提前开学、不双休、校外培训或其他。",
    ),
  },
  { label: "学校全称", key: "schoolName", parse: required(200, 2) },
  {
    label: "学校性质",
    key: "schoolCategory",
    parse: choice(
      { "公立学历制学校": "公立学历制学校", "私立学历制学校": "私立学历制学校", "校外培训机构": "校外培训机构" },
      "请填写公立学历制学校、私立学历制学校或校外培训机构。",
    ),
  },
  { label: "学校类型", key: "schoolType", parse: required(100, 2) },
  { label: "详细地址", key: "schoolAddress", parse: required(500, 5) },
  { label: "举报途径", key: "reportChannels", parse: required(500, 4) },
  { label: "行为描述", key: "description", parse: required(5_000, 20) },
  {
    label: "收费情况",
    key: "feeStatus",
    parse: choice({ "无": "none", "未收费": "none", "已收费": "charged", "不明": "unknown", "不清楚": "unknown" }, "请填写无、已收费或不明。"),
  },
  { label: "收费详情", key: "feeDetails", parse: optional(1_000) },
  {
    label: "诉求",
    key: "demands",
    parse: (answer) => {
      const values = [...new Set(answer.split(/[，,]/).map((item) => item.trim()).filter(Boolean))];
      if (values.length < 1 || values.length > 20 || values.some((item) => item.length > 200)) {
        throw new Error("请填写 1-20 项明确诉求，每项不超过 200 字，并用逗号分隔。");
      }
      return values;
    },
  },
  { label: "其他诉求", key: "otherDemand", parse: optional(1_000) },
  { label: "涉及年级", key: "grade", parse: optional(20) },
  { label: "时间范围", key: "timeRange", parse: optional(200) },
  { label: "所在省份", key: "province", parse: required(50, 2) },
  { label: "所在城市", key: "city", parse: required(50, 2) },
  { label: "期望互助人省份", key: "expectedHelperProvince", parse: optional(50) },
  {
    label: "风险偏好",
    key: "riskPreference",
    parse: choice(
      { "不限": "不限", "仅站内沟通": "仅站内沟通", "可电话": "可电话", "仅模板咨询": "仅模板咨询" },
      "请填写不限、仅站内沟通、可电话或仅模板咨询。",
    ),
  },
] as const;

const FIELD_BY_LABEL = new Map(FIELDS.map((field) => [field.label, field]));

export const QQ_DELEGATION_TEMPLATE = `请一次填写并发送以下完整模板，不要删除字段名。需要修改时请重新发送完整模板。
可参考委托表生成器：https://1kxfhpte.jsjform.com/f/TMcGoz

内容类型：学校补课/提前开学/不双休/校外培训/其他
学校全称：
学校性质：公立学历制学校/私立学历制学校/校外培训机构
学校类型：例如高级中学
详细地址：
举报途径：至少一种，例如区号+12345、市教育局或省教育厅电话
行为描述：请写明事实，不要填写姓名、手机号、班级等个人信息
收费情况：无/已收费/不明
收费详情：无或具体金额、方式
诉求：多项用中文逗号分隔
其他诉求：无
涉及年级：
时间范围：补课请写日期范围或星期与时段；提前开学请写规定日期和实际日期
所在省份：
所在城市：
期望互助人省份：无
风险偏好：不限/仅站内沟通/可电话/仅模板咨询（必填）

自愿与真实性声明、最终核对和正式提交仅在登录后的网页中完成。`;

export function parseQQDelegationForm(text: string): Payload {
  const values = new Map<string, string>();
  let currentLabel: string | null = null;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([^：:]{1,30})[：:]\s*(.*)$/);
    const label = match?.[1].trim();
    if (label && FIELD_BY_LABEL.has(label)) {
      if (values.has(label)) throw new Error(`字段“${label}”重复，请只保留一项。`);
      values.set(label, match?.[2].trim() ?? "");
      currentLabel = label;
      continue;
    }
    if (!currentLabel) throw new Error("请保留固定模板的字段名，并从“内容类型”开始填写。");
    values.set(currentLabel, `${values.get(currentLabel)}\n${line}`.trim());
  }

  const missing = FIELDS.filter((field) => !field.optional && !values.get(field.label)).map((field) => field.label);
  if (missing.length > 0) throw new Error(`请补全以下字段：${missing.join("、")}。没有相关信息时请填写“无”。`);

  let payload: Payload = {};
  for (const field of FIELDS) {
    try {
      payload = { ...payload, [field.key]: field.parse(values.get(field.label) ?? "无", payload) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "格式不正确。";
      throw new Error(`${field.label}：${reason}`);
    }
  }
  return payload;
}

export function validateQQDelegationRequirements(payload: Payload): string[] {
  const issues: string[] = [];
  const type = payload.contentType;
  const grade = typeof payload.grade === "string" ? payload.grade : "";
  const timeRange = typeof payload.timeRange === "string" ? payload.timeRange : "";
  const description = typeof payload.description === "string" ? payload.description : "";

  if (payload.feeStatus === "charged" && !payload.feeDetails) issues.push("已收费时请在“收费详情”中填写金额和收费方式。");
  if (type === "TUTORING" || type === "NO_WEEKENDS") {
    if (!grade) issues.push("请填写涉及年级。");
    if (!timeRange) issues.push("请填写补课或到校安排的日期范围，或星期与具体时段。");
  }
  if (type === "EARLY_START") {
    if (!grade) issues.push("请填写涉及年级。");
    const schedule = `${description}\n${timeRange}`;
    if (!/规定.{0,12}(?:日期|时间)/.test(schedule) || !/实际.{0,12}(?:日期|时间)/.test(schedule)) {
      issues.push("提前开学请明确填写规定开学日期和实际开学日期。");
    }
  }
  if (type === "OTHER") issues.push("该类型暂不适用 QQ 委托预审，请通过站内渠道联系管理员说明情况。");
  return issues;
}

export function buildCanonicalQQDraft(payload: Payload): { payload: Payload; canonical: string; hash: string } {
  const core = validateQQDelegationDraft({
    schemaVersion: QQ_DELEGATION_SCHEMA_VERSION,
    contentType: payload.contentType,
    schoolName: payload.schoolName,
    schoolCategory: payload.schoolCategory,
    schoolType: payload.schoolType,
    schoolAddress: payload.schoolAddress,
    reportChannels: payload.reportChannels,
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
