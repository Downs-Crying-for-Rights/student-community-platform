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

/**
 * Scan text content for sensitive words using simple string matching (indexOf).
 * Returns all matches with their positions.
 */
export async function scanContent(text: string): Promise<SensitiveMatch[]> {
  if (!text || text.length === 0) {
    return [];
  }

  const words = await loadSensitiveWords();
  const matches: SensitiveMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const entry of words) {
    const lowerWord = entry.word.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const index = lowerText.indexOf(lowerWord, searchFrom);
      if (index === -1) break;

      matches.push({
        word: text.slice(index, index + entry.word.length),
        category: entry.category,
        startIndex: index,
        endIndex: index + entry.word.length,
      });

      searchFrom = index + 1;
    }
  }

  // Sort by position for consistent output
  matches.sort((a, b) => a.startIndex - b.startIndex);

  return matches;
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
