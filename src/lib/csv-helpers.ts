/**
 * CSV 工具纯函数模块
 *
 * 提供 CSV 导出所需的纯函数：字段转义、数据脱敏、行构建。
 * 所有函数无副作用，便于单元测试和属性测试。
 */

import type { SensitiveMatch } from "./sensitive-engine";

/* ========== Types ========== */

/** CSV 导出所需的工单数据结构 */
export interface CaseExportData {
  id: string;
  category: string;
  status: string;
  formData: string;
  pledgeText: string;
  createdAt: string;
  submitterId: string;
}

/** CSV 头行字段顺序 */
export const CSV_HEADERS = "id,category,status,formData,pledgeText,createdAt,submitterId";

/* ========== Pure Functions ========== */

/**
 * RFC 4180 CSV 字段转义。
 *
 * 当字段包含逗号、双引号或换行符时，用双引号包裹整个字段，
 * 并将内部双引号转义为两个双引号。
 */
export function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 将 formData 中被检测到的敏感词替换为 `[已脱敏]`。
 *
 * 接收预先通过 `scanContent` 得到的匹配结果，对 formData 中每个字符串值
 * 进行替换。非字符串值保持不变。
 *
 * @param formData - 表单数据键值对
 * @param matches - scanContent 检测到的敏感词匹配列表
 * @returns 脱敏后的 formData 副本
 */
export function sanitizeFormData(
  formData: Record<string, string>,
  matches: SensitiveMatch[],
): Record<string, string> {
  if (matches.length === 0) return { ...formData };

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(formData)) {
    // 找出属于当前值的匹配项（通过检查 word 是否出现在 value 中）
    let sanitized = value;
    // 收集当前值中的所有匹配，按 startIndex 降序排列以便从后往前替换
    const valueMatches: Array<{ word: string; startIndex: number; endIndex: number }> = [];

    for (const match of matches) {
      // 在当前值中查找所有匹配词出现的位置
      let searchFrom = 0;
      while (searchFrom < sanitized.length) {
        const idx = sanitized.indexOf(match.word, searchFrom);
        if (idx === -1) break;
        valueMatches.push({
          word: match.word,
          startIndex: idx,
          endIndex: idx + match.word.length,
        });
        searchFrom = idx + 1;
      }
    }

    // 按位置降序排列，从后往前替换以保持索引正确
    valueMatches.sort((a, b) => b.startIndex - a.startIndex);

    for (const vm of valueMatches) {
      sanitized =
        sanitized.slice(0, vm.startIndex) +
        "[已脱敏]" +
        sanitized.slice(vm.endIndex);
    }

    result[key] = sanitized;
  }

  return result;
}

/**
 * 构建 CSV 数据行。
 *
 * 按 CSV_HEADERS 定义的字段顺序，对每个字段值调用 `escapeCsvField` 转义后
 * 用逗号连接。
 *
 * @param caseData - 已处理（脱敏/哈希）的工单导出数据
 * @returns CSV 格式的数据行字符串
 */
export function buildCsvRow(caseData: CaseExportData): string {
  const fields = [
    caseData.id,
    caseData.category,
    caseData.status,
    caseData.formData,
    caseData.pledgeText,
    caseData.createdAt,
    caseData.submitterId,
  ];

  return fields.map(escapeCsvField).join(",");
}
