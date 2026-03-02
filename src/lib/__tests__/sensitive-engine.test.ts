import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SensitiveWordCategory } from "@prisma/client";

// ==================== Mocks ====================

const mockWords = vi.hoisted(() => [
  { word: "身份证号", category: "PII" as const },
  { word: "手机号", category: "PII" as const },
  { word: "自杀", category: "RISK" as const },
  { word: "加我微信", category: "PHISHING" as const },
  { word: "脏话", category: "PROFANITY" as const },
]);

const redisStore = vi.hoisted(() => new Map<string, string>());

vi.mock("../prisma", () => ({
  default: {
    sensitiveWord: {
      findMany: vi.fn().mockResolvedValue(
        mockWords.map((w) => ({ word: w.word, category: w.category }))
      ),
    },
  },
}));

vi.mock("../redis", () => ({
  default: {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
  },
}));

import {
  scanContent,
  highlightSensitive,
  loadSensitiveWords,
  invalidateSensitiveWordsCache,
  type SensitiveMatch,
} from "../sensitive-engine";

beforeEach(async () => {
  redisStore.clear();
  vi.clearAllMocks();
});

// ==================== loadSensitiveWords ====================

describe("loadSensitiveWords", () => {
  it("should load words from DB when cache is empty", async () => {
    const words = await loadSensitiveWords();
    expect(words).toHaveLength(mockWords.length);
    expect(words[0]).toEqual({ word: "身份证号", category: "PII" });
  });

  it("should return cached words on second call", async () => {
    const prisma = (await import("../prisma")).default;
    await loadSensitiveWords(); // populates cache
    await loadSensitiveWords(); // should use cache
    expect(prisma.sensitiveWord.findMany).toHaveBeenCalledTimes(1);
  });

  it("should fall back to DB when Redis get fails", async () => {
    const redis = (await import("../redis")).default;
    (redis.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Redis down")
    );
    const words = await loadSensitiveWords();
    expect(words).toHaveLength(mockWords.length);
  });
});

// ==================== scanContent ====================

describe("scanContent", () => {
  it("should return empty array for empty text", async () => {
    const matches = await scanContent("");
    expect(matches).toEqual([]);
  });

  it("should detect a single sensitive word", async () => {
    const matches = await scanContent("请不要泄露身份证号给他人");
    expect(matches).toHaveLength(1);
    expect(matches[0].word).toBe("身份证号");
    expect(matches[0].category).toBe("PII");
    expect(matches[0].startIndex).toBe(5);
    expect(matches[0].endIndex).toBe(9);
  });

  it("should detect multiple different sensitive words", async () => {
    const matches = await scanContent("身份证号和手机号不要泄露");
    expect(matches).toHaveLength(2);
    expect(matches[0].word).toBe("身份证号");
    expect(matches[1].word).toBe("手机号");
  });

  it("should detect repeated occurrences of the same word", async () => {
    const matches = await scanContent("手机号是手机号");
    expect(matches).toHaveLength(2);
    expect(matches[0].startIndex).toBe(0);
    expect(matches[1].startIndex).toBe(4);
  });

  it("should detect PHISHING category words", async () => {
    const matches = await scanContent("加我微信吧");
    expect(matches).toHaveLength(1);
    expect(matches[0].word).toBe("加我微信");
    expect(matches[0].category).toBe("PHISHING");
  });

  it("should return matches sorted by position", async () => {
    const matches = await scanContent("脏话和身份证号");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].startIndex).toBeGreaterThanOrEqual(
        matches[i - 1].startIndex
      );
    }
  });

  it("should return no matches for clean text", async () => {
    const matches = await scanContent("今天天气真好");
    expect(matches).toEqual([]);
  });
});

// ==================== highlightSensitive ====================

describe("highlightSensitive", () => {
  it("should return original text when no matches", () => {
    const result = highlightSensitive("hello world", []);
    expect(result).toBe("hello world");
  });

  it("should wrap a single match with markers", () => {
    const matches: SensitiveMatch[] = [
      { word: "身份证号", category: "PII", startIndex: 5, endIndex: 9 },
    ];
    const result = highlightSensitive("请不要泄露身份证号给他人", matches);
    expect(result).toBe("请不要泄露【身份证号】给他人");
  });

  it("should wrap multiple matches correctly", () => {
    const matches: SensitiveMatch[] = [
      { word: "身份证号", category: "PII", startIndex: 0, endIndex: 4 },
      { word: "手机号", category: "PII", startIndex: 5, endIndex: 8 },
    ];
    const result = highlightSensitive("身份证号和手机号不要泄露", matches);
    expect(result).toBe("【身份证号】和【手机号】不要泄露");
  });

  it("should handle match at the start of text", () => {
    const matches: SensitiveMatch[] = [
      { word: "脏话", category: "PROFANITY", startIndex: 0, endIndex: 2 },
    ];
    const result = highlightSensitive("脏话不好", matches);
    expect(result).toBe("【脏话】不好");
  });

  it("should handle match at the end of text", () => {
    const matches: SensitiveMatch[] = [
      { word: "脏话", category: "PROFANITY", startIndex: 3, endIndex: 5 },
    ];
    const result = highlightSensitive("不要说脏话", matches);
    expect(result).toBe("不要说【脏话】");
  });
});

// ==================== invalidateSensitiveWordsCache ====================

describe("invalidateSensitiveWordsCache", () => {
  it("should delete the cache key from Redis", async () => {
    const redis = (await import("../redis")).default;
    await invalidateSensitiveWordsCache();
    expect(redis.del).toHaveBeenCalledWith("sensitive-words:all");
  });

  it("should not throw when Redis is unavailable", async () => {
    const redis = (await import("../redis")).default;
    (redis.del as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Redis down")
    );
    await expect(invalidateSensitiveWordsCache()).resolves.not.toThrow();
  });
});
