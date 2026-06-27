import { SensitiveWordCategory } from "@prisma/client";
import prisma from "./prisma";
import redis from "./redis";

// ==================== Types ====================

export interface SensitiveWordEntry {
  word: string;
  category: SensitiveWordCategory;
}

export interface SensitiveMatch {
  word: string;
  category: SensitiveWordCategory;
  startIndex: number;
  endIndex: number;
}

// ==================== Constants ====================

const CACHE_KEY = "sensitive-words:all";
const CACHE_TTL = 3600; // 1 hour in seconds

// ==================== Core Functions ====================

/**
 * Load sensitive words from database, with Redis caching (1 hour TTL).
 * Returns all active sensitive words grouped by category.
 */
export async function loadSensitiveWords(): Promise<SensitiveWordEntry[]> {
  // Try cache first
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as SensitiveWordEntry[];
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  // Load from database
  const words = await prisma.sensitiveWord.findMany({
    where: { isActive: true },
    select: { word: true, category: true },
  });

  const entries: SensitiveWordEntry[] = words.map((w) => ({
    word: w.word,
    category: w.category,
  }));

  // Cache to Redis
  try {
    await redis.set(CACHE_KEY, JSON.stringify(entries), "EX", CACHE_TTL);
  } catch {
    // Redis unavailable — continue without caching
  }

  return entries;
}

// ==================== Regex Patterns ====================

/**
 * Built-in regex patterns for sensitive PII detection.
 * These run alongside the DB word list — no caching needed.
 */
export const PII_REGEX_PATTERNS: { pattern: RegExp; label: string; category: SensitiveWordCategory }[] = [
  // 中国大陆手机号: 1 开头 10 位数字
  { pattern: /1[3-9]\d{9}/g, label: "手机号", category: "PII" as SensitiveWordCategory },
  // 身份证号: 18 位 (17 位数字 + 数字/X) 或 15 位老版
  { pattern: /\b\d{17}[\dXx]\b/g, label: "身份证号", category: "PII" as SensitiveWordCategory },
  { pattern: /\b\d{15}\b/g, label: "身份证号(15位)", category: "PII" as SensitiveWordCategory },
  // 学号: 常见格式 (年份+数字 或 纯数字8-12位上下文)
  { pattern: /学号[：:\s]*(\d{6,12})/g, label: "学号", category: "PII" as SensitiveWordCategory },
  // 班级: 如 高一3班、2024级1班
  { pattern: /(?:高[一二三]|初[一二三]|小[一二三四五六]|[12]\d级)\s*\d{1,2}\s*班/g, label: "班级信息", category: "PII" as SensitiveWordCategory },
  // QQ号: 5-12位数字
  { pattern: /QQ[号：:\s]*(\d{5,12})/gi, label: "QQ号", category: "PII" as SensitiveWordCategory },
  // 微信号: wxid_xxx 或 字母+数字组合
  { pattern: /微信[号：:\s]*[a-zA-Z0-9_-]{6,20}/g, label: "微信号", category: "PII" as SensitiveWordCategory },
  // 电子邮箱
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "电子邮箱", category: "PII" as SensitiveWordCategory },
  // 精确定位: 经度+纬度 或 "E/W + N/S" 格式
  { pattern: /(?:东经|西经|E|W)\s*\d{2,3}[°°]\d{1,2}['']\d{1,2}[''′]?\s*[,，]\s*(?:北纬|南纬|N|S)\s*\d{2,3}[°°]\d{1,2}['']\d{1,2}[''′]?/g, label: "精确定位", category: "PII" as SensitiveWordCategory },
];

/**
 * Scan text with built-in regex patterns for PII detection.
 * Pure function — no DB/Redis dependency, always available.
 */
export function scanWithRegex(text: string): SensitiveMatch[] {
  if (!text || text.length === 0) return [];

  const matches: SensitiveMatch[] = [];
  const seen = new Set<string>(); // deduplicate overlapping matches

  for (const { pattern, label, category } of PII_REGEX_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const key = `${m.index}:${m.index + m[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        word: m[0],
        category,
        startIndex: m.index,
        endIndex: m.index + m[0].length,
      });
    }
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Scan text content for sensitive words using simple string matching (indexOf)
 * AND built-in PII regex patterns.
 * Returns all matches with their positions, deduplicated.
 */
export async function scanContent(text: string): Promise<SensitiveMatch[]> {
  if (!text || text.length === 0) {
    return [];
  }

  // 1. Regex-based PII scan (sync, no DB dependency)
  const regexMatches = scanWithRegex(text);

  // 2. Word-list scan from DB (async, with Redis cache)
  const words = await loadSensitiveWords();
  const wordMatches: SensitiveMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const entry of words) {
    const lowerWord = entry.word.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const index = lowerText.indexOf(lowerWord, searchFrom);
      if (index === -1) break;

      wordMatches.push({
        word: text.slice(index, index + entry.word.length),
        category: entry.category,
        startIndex: index,
        endIndex: index + entry.word.length,
      });

      searchFrom = index + 1;
    }
  }

  // 3. Merge & deduplicate by position
  const seen = new Set<string>();
  const allMatches: SensitiveMatch[] = [];

  for (const m of [...regexMatches, ...wordMatches]) {
    const key = `${m.startIndex}:${m.endIndex}:${m.word}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allMatches.push(m);
  }

  return allMatches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Wrap matched sensitive words with highlight markers.
 * Uses 【 and 】 as markers around sensitive text.
 * Processes matches from end to start to preserve index positions.
 */
export function highlightSensitive(
  text: string,
  matches: SensitiveMatch[]
): string {
  if (!matches || matches.length === 0) {
    return text;
  }

  // Sort matches by startIndex descending so we can replace from end to start
  // without invalidating earlier indices
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  let result = text;
  for (const match of sorted) {
    const before = result.slice(0, match.startIndex);
    const matched = result.slice(match.startIndex, match.endIndex);
    const after = result.slice(match.endIndex);
    result = `${before}【${matched}】${after}`;
  }

  return result;
}

/**
 * Invalidate the sensitive words cache.
 * Call this when sensitive words are added/updated/deleted.
 */
export async function invalidateSensitiveWordsCache(): Promise<void> {
  try {
    await redis.del(CACHE_KEY);
  } catch {
    // Redis unavailable — ignore
  }
}
