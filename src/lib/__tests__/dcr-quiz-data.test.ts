import { describe, it, expect } from 'vitest';

import {
  QUIZ_QUESTIONS,
  pickRandomQuestions,
  gradeQuiz,
  type QuizQuestion,
} from '../dcr-quiz-data';

describe('dcr-quiz-data', () => {
  describe('QUIZ_QUESTIONS', () => {
    it('contains at least 10 questions', () => {
      expect(QUIZ_QUESTIONS.length).toBeGreaterThanOrEqual(10);
    });

    it('each question has required fields', () => {
      for (const q of QUIZ_QUESTIONS) {
        expect(q.id).toBeTruthy();
        expect(q.text).toBeTruthy();
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctKey).toBeTruthy();
        expect(q.explanation).toBeTruthy();
      }
    });

    it('each question has a valid correctKey matching one of its options', () => {
      for (const q of QUIZ_QUESTIONS) {
        const keys = q.options.map((o) => o.key);
        expect(keys).toContain(q.correctKey);
      }
    });

    it('all question ids are unique', () => {
      const ids = QUIZ_QUESTIONS.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('pickRandomQuestions', () => {
    it('returns the requested number of questions', () => {
      const result = pickRandomQuestions(5);
      expect(result).toHaveLength(5);
    });

    it('returns no duplicates', () => {
      const result = pickRandomQuestions(5);
      const ids = result.map((q) => q.id);
      expect(new Set(ids).size).toBe(5);
    });

    it('returns all questions from the pool', () => {
      const result = pickRandomQuestions(5);
      for (const q of result) {
        expect(QUIZ_QUESTIONS.find((orig) => orig.id === q.id)).toBeDefined();
      }
    });

    it('returns empty array for count <= 0', () => {
      expect(pickRandomQuestions(0)).toEqual([]);
      expect(pickRandomQuestions(-1)).toEqual([]);
    });

    it('caps at pool size when count exceeds pool', () => {
      const result = pickRandomQuestions(999);
      expect(result).toHaveLength(QUIZ_QUESTIONS.length);
    });
  });

  describe('gradeQuiz', () => {
    // Helper: create a set of 5 questions for testing
    const testQuestions: QuizQuestion[] = QUIZ_QUESTIONS.slice(0, 5);

    it('returns passed=true when all answers are correct', () => {
      const answers = testQuestions.map((q) => ({
        questionId: q.id,
        selectedKey: q.correctKey,
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(5);
      expect(result.total).toBe(5);
      expect(result.corrections).toBeUndefined();
    });

    it('returns passed=true with score=4 (threshold)', () => {
      const answers = testQuestions.map((q, i) => ({
        questionId: q.id,
        selectedKey: i === 0 ? 'WRONG' : q.correctKey,
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(4);
      expect(result.corrections).toBeUndefined();
    });

    it('returns passed=false with score=3 and corrections', () => {
      const answers = testQuestions.map((q, i) => ({
        questionId: q.id,
        selectedKey: i < 2 ? 'WRONG' : q.correctKey,
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(3);
      expect(result.total).toBe(5);
      expect(result.corrections).toHaveLength(2);
    });

    it('returns passed=false when all answers are wrong', () => {
      const answers = testQuestions.map((q) => ({
        questionId: q.id,
        selectedKey: 'WRONG',
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.corrections).toHaveLength(5);
    });

    it('corrections contain correct questionId, correctKey, and explanation', () => {
      const answers = testQuestions.map((q) => ({
        questionId: q.id,
        selectedKey: 'WRONG',
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.corrections).toBeDefined();
      for (const c of result.corrections!) {
        const original = testQuestions.find((q) => q.id === c.questionId);
        expect(original).toBeDefined();
        expect(c.correctKey).toBe(original!.correctKey);
        expect(c.explanation).toBe(original!.explanation);
      }
    });

    it('corrections only include wrong answers', () => {
      // Answer first 3 wrong, last 2 correct
      const answers = testQuestions.map((q, i) => ({
        questionId: q.id,
        selectedKey: i < 3 ? 'WRONG' : q.correctKey,
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(false);
      expect(result.corrections).toHaveLength(3);
      const correctionIds = result.corrections!.map((c) => c.questionId);
      // Should only contain the first 3 question ids
      for (let i = 0; i < 3; i++) {
        expect(correctionIds).toContain(testQuestions[i].id);
      }
      // Should NOT contain the last 2
      for (let i = 3; i < 5; i++) {
        expect(correctionIds).not.toContain(testQuestions[i].id);
      }
    });

    it('handles missing answers as wrong', () => {
      // Only answer 2 questions correctly, omit the rest
      const answers = testQuestions.slice(0, 2).map((q) => ({
        questionId: q.id,
        selectedKey: q.correctKey,
      }));
      const result = gradeQuiz(testQuestions, answers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(2);
      expect(result.corrections).toHaveLength(3);
    });
  });
});
