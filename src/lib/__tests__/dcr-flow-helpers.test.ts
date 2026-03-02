import { describe, it, expect } from 'vitest';
import { computeFlowStep, type FlowState } from '../dcr-flow-helpers';

describe('computeFlowStep', () => {
  it('returns 1 when caseStatus is null (no case)', () => {
    expect(computeFlowStep(null, false, false)).toBe(1);
  });

  it('returns 1 when caseStatus is CLOSED', () => {
    expect(computeFlowStep('CLOSED', false, false)).toBe(1);
  });

  it('returns 2 when caseStatus is OPENED', () => {
    expect(computeFlowStep('OPENED', false, false)).toBe(2);
  });

  it('returns 2 when caseStatus is NEED_MORE_INFO', () => {
    expect(computeFlowStep('NEED_MORE_INFO', false, false)).toBe(2);
  });

  it('returns 3 when caseStatus is IN_PROGRESS and quizPassed is false', () => {
    expect(computeFlowStep('IN_PROGRESS', false, false)).toBe(3);
  });

  it('returns 4 when quizPassed is true regardless of caseStatus', () => {
    expect(computeFlowStep('IN_PROGRESS', true, false)).toBe(4);
    expect(computeFlowStep('OPENED', true, false)).toBe(4);
    expect(computeFlowStep(null, true, false)).toBe(4);
    expect(computeFlowStep('CLOSED', true, true)).toBe(4);
  });

  it('returns 4 when quizPassed is true and dcrAccess is true', () => {
    expect(computeFlowStep('IN_PROGRESS', true, true)).toBe(4);
  });

  it('returns 1 for unknown caseStatus values', () => {
    expect(computeFlowStep('UNKNOWN_STATUS', false, false)).toBe(1);
  });
});

describe('FlowState interface', () => {
  it('can be constructed with all required fields', () => {
    const state: FlowState = {
      step: 1,
      delegationCase: null,
      quizPassed: false,
      dcrAccess: false,
    };
    expect(state.step).toBe(1);
    expect(state.delegationCase).toBeNull();
  });

  it('supports optional rejectionReason', () => {
    const state: FlowState = {
      step: 1,
      delegationCase: { status: 'CLOSED' },
      quizPassed: false,
      dcrAccess: false,
      rejectionReason: '信息不完整',
    };
    expect(state.rejectionReason).toBe('信息不完整');
  });
});
