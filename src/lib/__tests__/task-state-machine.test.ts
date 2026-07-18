import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getNextStates,
  FORWARD_TRANSITIONS,
  TERMINAL_STATES,
  aggregateHelpSessionStatus,
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

    it('allows rejection and closure from non-terminal states', () => {
      for (const from of ALL_STATUSES.filter((status) => !TERMINAL_STATES.includes(status))) {
        expect(canTransition(from, 'REJECTED')).toBe(true);
        expect(canTransition(from, 'CLOSED')).toBe(true);
      }
    });

    it('allows disputes only from active workflow states', () => {
      expect(canTransition('CLAIMED', 'DISPUTED')).toBe(true);
      expect(canTransition('IN_PROGRESS', 'DISPUTED')).toBe(true);
      expect(canTransition('EVIDENCE_PENDING', 'DISPUTED')).toBe(true);
      expect(canTransition('DRAFT', 'DISPUTED')).toBe(false);
      expect(canTransition('OPEN', 'DISPUTED')).toBe(false);
    });

    it('disallows every transition from terminal states', () => {
      for (const terminal of TERMINAL_STATES) {
        for (const target of ALL_STATUSES) {
          expect(canTransition(terminal, target)).toBe(false);
        }
      }
    });
  });

  describe('getNextStates', () => {
    it('returns forward + terminal states for non-terminal statuses', () => {
      const next = getNextStates('DRAFT');
      expect(next).toContain('SUBMITTED');
      expect(next).toContain('REJECTED');
      expect(next).toContain('CLOSED');
      expect(next).not.toContain('DISPUTED');
      expect(next).toHaveLength(3); // 1 forward + rejection + closure
    });

    it('returns no states for COMPLETED', () => {
      const next = getNextStates('COMPLETED');
      expect(next).toEqual([]);
    });

    it('returns no states for terminal statuses', () => {
      for (const terminal of TERMINAL_STATES) {
        expect(getNextStates(terminal)).toEqual([]);
      }
    });

    it('returns correct next states for OPEN', () => {
      const next = getNextStates('OPEN');
      expect(next).toContain('CLAIMED');
      expect(next).toContain('REJECTED');
      expect(next).toContain('CLOSED');
      expect(next).not.toContain('DISPUTED');
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

  describe('aggregateHelpSessionStatus', () => {
    it.each([
      [[], 'OPEN'],
      [['CLAIMED', 'CLAIMED'], 'CLAIMED'],
      [['CLAIMED', 'IN_PROGRESS'], 'IN_PROGRESS'],
      [['EVIDENCE_PENDING', 'EVIDENCE_PENDING'], 'EVIDENCE_PENDING'],
      [['COMPLETED', 'EVIDENCE_PENDING'], 'EVIDENCE_PENDING'],
      [['COMPLETED', 'IN_PROGRESS'], 'IN_PROGRESS'],
      [['COMPLETED', 'COMPLETED'], 'COMPLETED'],
      [['COMPLETED', 'CLOSED'], 'COMPLETED'],
      [['CLOSED', 'CLAIMED'], 'CLAIMED'],
      [['CLOSED', 'CLOSED'], 'OPEN'],
      [['COMPLETED', 'DISPUTED'], 'DISPUTED'],
      [['COMPLETED', 'CLAIMED'], 'CLAIMED'],
    ] as const)('aggregates %j as %s', (sessions, expected) => {
      expect(aggregateHelpSessionStatus([...sessions])).toBe(expected);
    });
  });
});
