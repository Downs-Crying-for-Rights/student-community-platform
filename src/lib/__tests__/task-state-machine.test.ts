import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getNextStates,
  FORWARD_TRANSITIONS,
  TERMINAL_STATES,
  type TaskStatus,
} from '../task-state-machine';

const ALL_STATUSES: TaskStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OPEN',
  'CLAIMED', 'IN_PROGRESS', 'EVIDENCE_PENDING',
  'COMPLETED', 'REJECTED', 'CLOSED', 'DISPUTED',
];

describe('task-state-machine', () => {
  describe('canTransition', () => {
    it('allows forward transitions along the happy path', () => {
      expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
      expect(canTransition('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
      expect(canTransition('UNDER_REVIEW', 'OPEN')).toBe(true);
      expect(canTransition('OPEN', 'CLAIMED')).toBe(true);
      expect(canTransition('CLAIMED', 'IN_PROGRESS')).toBe(true);
      expect(canTransition('IN_PROGRESS', 'EVIDENCE_PENDING')).toBe(true);
      expect(canTransition('EVIDENCE_PENDING', 'COMPLETED')).toBe(true);
    });

    it('disallows skipping states in the forward chain', () => {
      expect(canTransition('DRAFT', 'OPEN')).toBe(false);
      expect(canTransition('SUBMITTED', 'CLAIMED')).toBe(false);
      expect(canTransition('OPEN', 'COMPLETED')).toBe(false);
    });

    it('disallows backward transitions', () => {
      expect(canTransition('SUBMITTED', 'DRAFT')).toBe(false);
      expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
      expect(canTransition('OPEN', 'UNDER_REVIEW')).toBe(false);
    });

    it('allows transition to terminal states from any state', () => {
      for (const from of ALL_STATUSES) {
        for (const terminal of TERMINAL_STATES) {
          expect(canTransition(from, terminal)).toBe(true);
        }
      }
    });

    it('disallows transitions from terminal states (except to other terminals)', () => {
      expect(canTransition('COMPLETED', 'DRAFT')).toBe(false);
      expect(canTransition('COMPLETED', 'SUBMITTED')).toBe(false);
      expect(canTransition('REJECTED', 'OPEN')).toBe(false);
      expect(canTransition('CLOSED', 'OPEN')).toBe(false);
    });
  });

  describe('getNextStates', () => {
    it('returns forward + terminal states for non-terminal statuses', () => {
      const next = getNextStates('DRAFT');
      expect(next).toContain('SUBMITTED');
      expect(next).toContain('REJECTED');
      expect(next).toContain('CLOSED');
      expect(next).toContain('DISPUTED');
      expect(next).toHaveLength(4); // 1 forward + 3 terminal
    });

    it('returns only terminal states for COMPLETED', () => {
      const next = getNextStates('COMPLETED');
      expect(next).toEqual(TERMINAL_STATES);
    });

    it('returns only terminal states for terminal statuses', () => {
      for (const terminal of TERMINAL_STATES) {
        expect(getNextStates(terminal)).toEqual(TERMINAL_STATES);
      }
    });

    it('returns correct next states for OPEN', () => {
      const next = getNextStates('OPEN');
      expect(next).toContain('CLAIMED');
      expect(next).toContain('REJECTED');
      expect(next).toContain('CLOSED');
      expect(next).toContain('DISPUTED');
    });
  });

  describe('FORWARD_TRANSITIONS', () => {
    it('covers all 11 statuses', () => {
      expect(Object.keys(FORWARD_TRANSITIONS)).toHaveLength(11);
      for (const status of ALL_STATUSES) {
        expect(FORWARD_TRANSITIONS).toHaveProperty(status);
      }
    });
  });
});
