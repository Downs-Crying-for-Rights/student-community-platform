import { describe, it, expect } from "vitest";
import {
  adminUser,
  publicBoards,
  psychologyBoards,
  dcrBoards,
  allBoards,
  tags,
  knowledgeArticles,
  sensitiveWords,
  quizQuestions,
} from "../seed";

describe("Seed Data", () => {
  describe("Admin User", () => {
    it("should have correct admin configuration", () => {
      expect(adminUser.email).toBe("admin@student-community.local");
      expect(adminUser.role).toBe("ADMIN");
      expect(adminUser.onboardingDone).toBe(true);
      expect(adminUser.quizPassed).toBe(true);
    });
  });

  describe("Boards", () => {
    it("should have 6 public boards", () => {
      expect(publicBoards).toHaveLength(6);
    });

    it("should have 2 psychology boards", () => {
      expect(psychologyBoards).toHaveLength(2);
    });

    it("should have 2 DCR boards", () => {
      expect(dcrBoards).toHaveLength(2);
    });

    it("should have 10 total boards", () => {
      expect(allBoards).toHaveLength(10);
    });

    it("should assign correct zones to all boards", () => {
      publicBoards.forEach((b) => expect(b.zone).toBe("PUBLIC"));
      psychologyBoards.forEach((b) => expect(b.zone).toBe("PSYCHOLOGY"));
      dcrBoards.forEach((b) => expect(b.zone).toBe("DCR"));
    });

    it("should have sequential sortWeights within each zone", () => {
      publicBoards.forEach((b, i) => expect(b.sortWeight).toBe(i));
      psychologyBoards.forEach((b, i) => expect(b.sortWeight).toBe(i));
      dcrBoards.forEach((b, i) => expect(b.sortWeight).toBe(i));
    });

    it("should include required public boards", () => {
      const names = publicBoards.map((b) => b.name);
      expect(names).toContain("娱乐");
      expect(names).toContain("工具使用");
      expect(names).toContain("AI 效率");
      expect(names).toContain("基础编程");
      expect(names).toContain("隐私与账号安全科普");
      expect(names).toContain("公告");
    });
  });

  describe("Tags", () => {
    it("should have 14 tags", () => {
      expect(tags).toHaveLength(14);
    });

    it("should have unique tag names", () => {
      const unique = new Set(tags);
      expect(unique.size).toBe(tags.length);
    });
  });

  describe("Knowledge Articles", () => {
    it("should have 10 articles (8-12 range)", () => {
      expect(knowledgeArticles.length).toBeGreaterThanOrEqual(8);
      expect(knowledgeArticles.length).toBeLessThanOrEqual(12);
    });

    it("should have both PUBLIC and DCR_ONLY articles", () => {
      const publicArticles = knowledgeArticles.filter((a) => a.visibility === "PUBLIC");
      const dcrArticles = knowledgeArticles.filter((a) => a.visibility === "DCR_ONLY");
      expect(publicArticles.length).toBeGreaterThan(0);
      expect(dcrArticles.length).toBeGreaterThan(0);
    });

    it("should have non-empty title and content for all articles", () => {
      knowledgeArticles.forEach((a) => {
        expect(a.title.length).toBeGreaterThan(0);
        expect(a.content.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Sensitive Words", () => {
    it("should cover all four categories", () => {
      expect(sensitiveWords.PII.length).toBeGreaterThan(0);
      expect(sensitiveWords.RISK.length).toBeGreaterThan(0);
      expect(sensitiveWords.PHISHING.length).toBeGreaterThan(0);
      expect(sensitiveWords.PROFANITY.length).toBeGreaterThan(0);
    });

    it("should have at least 4 words per category", () => {
      Object.values(sensitiveWords).forEach((words) => {
        expect(words.length).toBeGreaterThanOrEqual(4);
      });
    });

    it("should have unique words across all categories", () => {
      const allWords = Object.values(sensitiveWords).flat();
      const unique = new Set(allWords);
      expect(unique.size).toBe(allWords.length);
    });
  });

  describe("Quiz Questions", () => {
    it("should have 5 quiz questions", () => {
      expect(quizQuestions).toHaveLength(5);
    });

    it("should have valid structure for each question", () => {
      quizQuestions.forEach((q) => {
        expect(q.question.length).toBeGreaterThan(0);
        expect(q.options).toHaveLength(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
      });
    });
  });
});
