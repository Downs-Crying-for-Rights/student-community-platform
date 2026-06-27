/**
 * DCR 委托表字段抽取引擎
 *
 * 从委托表 formData + pledgeText 中抽取结构化字段，生成：
 * - extractedFields: 已抽取的字段键值对
 * - missingFields:  缺失的必填项清单
 *
 * 纯函数设计，无副作用，便于测试。
 */

/* ========== Types ========== */

export interface ExtractionResult {
  /** 已抽取的字段 (如 schoolName/city/grade/timeRange/feeStatus/channels/pledge) */
  extractedFields: Record<string, string>;
  /** 缺失的必填项清单 */
  missingFields: string[];
  /** 抽取日志 (调试用) */
  log: string[];
}

/** 委托表原始数据 */
export interface DelegationInput {
  /** 内容类型: 学校补课类|学校提前开学类|学校不双休类|校外培训机构类|其他 */
  contentType?: string;
  schoolName?: string;
  schoolCategory?: string;
  schoolType?: string;
  schoolAddress?: string;
  reportChannels?: string;
  description?: string;
  feeStatus?: string;
  feeDetails?: string;
  demands?: string[];
  otherDemand?: string;
  /** 结构化字段 */
  grade?: string;
  timeRange?: string;
  province?: string;
  city?: string;
  expectedHelperProvince?: string;
  riskPreference?: string;
  /** pledgeText 额外分析 */
  pledgeText?: string;
}

/* ========== Constants ========== */

/** 必填字段名及其中文描述 */
export const REQUIRED_FIELDS: Record<string, string> = {
  schoolName: "学校名称",
  address: "学校地址(至少到市区)",
  grade: "年级",
  typeCategory: "补课类型",
  timeRange: "时间信息(时间段或日期范围)",
  feeStatus: "收费情况",
  reportChannel: "举报途径(区号+12345 或部门+电话)",
  pledge: "真实性承诺",
};

/** 区号+12345 正则 */
const CHANNEL_12345_RE = /(\d{3,4})[\s\-]?12345/;

/** 部门+电话正则 (区号+数字) */
const CHANNEL_DEPT_PHONE_RE = /([\u4e00-\u9fa5]+(?:局|厅|部|处|委)).*?(\d{3,4}[\s\-]?\d{6,8})/;

/** 态度句关键词 (命中则无效) */
const ATTITUDE_PATTERNS = [
  /我已按要求(?:书写|填写|完成)/,
  /请通过/,
  /给我链接/,
  /审核通过/,
  /回复我已获得/,
  /已按要求写了/,
  /请通过审核/,
  /我需要链接/,
  /帮帮我通过/,
];

/* ========== Core Functions ========== */

/**
 * 检测文本中是否包含态度句 (命中则抽取无效)
 */
export function hasAttitudePhrases(text: string): boolean {
  return ATTITUDE_PATTERNS.some((re) => re.test(text));
}

/**
 * 检测文本中是否包含多所学校 (简易启发式: 学校名+"、"或"和"连用)
 */
export function hasMultipleSchools(text: string): boolean {
  const schoolPattern = /(?:学校|中学|小学|大学|学院)/g;
  const matches = text.match(schoolPattern);
  return matches !== null && matches.length >= 3;
}

/**
 * 检测是否仅链接或字数不足
 */
export function isOnlyLinkOrTooShort(text: string): { onlyLink: boolean; tooShort: boolean } {
  const stripped = text.trim();
  const urlPattern = /^https?:\/\/\S+$/;
  return {
    onlyLink: urlPattern.test(stripped),
    tooShort: stripped.length < 80,
  };
}

/**
 * 从 text 中尝试提取区号+12345 格式的举报途径
 */
function extract12345(text: string): string | null {
  const m = text.match(CHANNEL_12345_RE);
  return m ? `${m[1]}-12345` : null;
}

/**
 * 从 text 中尝试提取部门+电话格式的举报途径
 */
function extractDeptPhone(text: string): string | null {
  const m = text.match(CHANNEL_DEPT_PHONE_RE);
  return m ? `${m[1]}: ${m[2]}` : null;
}

/**
 * 从地址文本中尝试提取省/市
 */
function extractCity(address: string): { province: string; city: string } {
  // 简单正则匹配 "XX省XX市" 或 "XX市"
  const provCityRe = /([\u4e00-\u9fa5]{2,4}(?:省|自治区|特别行政区))?\s*([\u4e00-\u9fa5]{2,4}(?:市|区|县|州))/;
  const m = address.match(provCityRe);
  if (m) {
    return { province: m[1] || "", city: m[2] || "" };
  }
  return { province: "", city: "" };
}

/**
 * 从 schoolType/description 推断年级
 */
function extractGrade(schoolType?: string, description?: string): string {
  const combined = [schoolType, description].filter(Boolean).join(" ");
  const gradeRe = /(?:高一|高二|高三|初一|初二|初三|小学\d年级|学前|幼儿园|大一|大二|大三|大四)/;
  const m = combined.match(gradeRe);
  return m ? m[0] : "";
}

/**
 * 从 description 中提取时间范围
 */
function extractTimeRange(description?: string, contentType?: string): string {
  if (!description) return "";
  // 周末时间段 "周六 8:30-17:30"
  const weekendRe = /(?:周[一二三四五六日]|星期[一二三四五六日])\s*\d{1,2}(?::\d{2})?\s*[-~至到]\s*\d{1,2}(?::\d{2})?/;
  const weekendMatch = description.match(weekendRe);
  if (weekendMatch) return weekendMatch[0];

  // 日期范围 "8.18-8.31" 或 "8月18日-8月31日"
  const dateRangeRe = /(\d{1,2}(?:\.\d{1,2}|\/\d{1,2}|\s*月\s*\d{1,2}\s*日))[\s]*[-~至到][\s]*(\d{1,2}(?:\.\d{1,2}|\/\d{1,2}|\s*月\s*\d{1,2}\s*日))/;
  const dateMatch = description.match(dateRangeRe);
  if (dateMatch) return dateMatch[0];

  return "";
}

/**
 * 主入口: 从委托表数据中抽取字段并返回缺项清单
 */
export function extractFields(input: DelegationInput): ExtractionResult {
  const log: string[] = [];
  const fields: Record<string, string> = {};
  const missing: string[] = [];

  // 拼接所有文本用于分析
  const allText = [
    input.schoolName,
    input.schoolAddress,
    input.reportChannels,
    input.description,
    input.feeDetails,
    input.pledgeText,
    input.province,
    input.city,
    input.grade,
    input.timeRange,
  ].filter(Boolean).join("\n");

  // --- 1. 学校名称 ---
  if (input.schoolName) {
    fields.schoolName = input.schoolName;
  } else {
    missing.push(REQUIRED_FIELDS.schoolName);
  }

  // --- 2. 地址 → province/city ---
  const { province, city } = extractCity(input.schoolAddress || "");
  if (input.province) fields.province = input.province;
  else if (province) fields.province = province;
  else missing.push(REQUIRED_FIELDS.address);

  if (input.city) fields.city = input.city;
  else if (city) fields.city = city;
  else if (!missing.includes(REQUIRED_FIELDS.address)) {
    missing.push(REQUIRED_FIELDS.address);
  }

  // --- 3. 年级 ---
  const grade = extractGrade(input.schoolType, input.description);
  if (input.grade) fields.grade = input.grade;
  else if (grade) fields.grade = grade;
  else missing.push(REQUIRED_FIELDS.grade);

  // --- 4. 补课类型 ---
  if (input.contentType) {
    fields.typeCategory = input.contentType;
    if (input.contentType === "其他") {
      missing.push("类型为'其他'，需转人工审核");
    }
  } else {
    missing.push(REQUIRED_FIELDS.typeCategory);
  }

  // --- 5. 时间范围 ---
  const timeRange = extractTimeRange(input.description, input.contentType);
  if (input.timeRange) fields.timeRange = input.timeRange;
  else if (timeRange) fields.timeRange = timeRange;
  else missing.push(REQUIRED_FIELDS.timeRange);

  // --- 6. 收费情况 ---
  if (input.feeStatus) {
    const feeMap: Record<string, string> = { none: "未收费", charged: "已收费", unknown: "不清楚" };
    fields.feeStatus = feeMap[input.feeStatus] || input.feeStatus;
    if (input.feeStatus === "charged" && input.feeDetails) {
      fields.feeDetails = input.feeDetails;
    }
  } else {
    missing.push(REQUIRED_FIELDS.feeStatus);
  }

  // --- 7. 举报途径 ---
  const reportText = input.reportChannels || "";
  const channel12345 = extract12345(reportText);
  const channelDept = extractDeptPhone(reportText);
  if (channel12345) {
    fields.reportChannel = channel12345;
  } else if (channelDept) {
    fields.reportChannel = channelDept;
  } else {
    missing.push(REQUIRED_FIELDS.reportChannel);
  }

  // --- 8. 真实性承诺 ---
  if (input.pledgeText && input.pledgeText.length > 10) {
    fields.pledge = input.pledgeText.slice(0, 200);
  } else {
    missing.push(REQUIRED_FIELDS.pledge);
  }

  // --- 可选字段 ---
  if (input.expectedHelperProvince) fields.expectedHelperProvince = input.expectedHelperProvince;
  if (input.riskPreference) fields.riskPreference = input.riskPreference;

  // --- 态度句检测 ---
  if (hasAttitudePhrases(allText)) {
    log.push("检测到态度句 (如'请通过''给我链接')，视为无效内容");
    if (!missing.includes("态度句无效")) missing.push("态度句无效");
  }

  // --- 多校检测 ---
  if (hasMultipleSchools(allText)) {
    log.push("检测到多个学校名称，一次仅限一所学校");
    if (!missing.includes("多校检测")) missing.push("多校检测");
  }

  // --- 仅链接/字数检测 ---
  const { onlyLink, tooShort } = isOnlyLinkOrTooShort(allText);
  if (onlyLink) {
    log.push("委托表内容仅为链接");
    if (!missing.includes("仅链接")) missing.push("仅链接");
  }
  if (tooShort) {
    log.push(`内容字数不足 (${allText.length}字 < 80字)`);
    if (!missing.includes("字数不足80")) missing.push("字数不足80");
  }

  return { extractedFields: fields, missingFields: missing, log };
}
