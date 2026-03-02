import { describe, it, expect } from 'vitest';
import { checkCompletionRequirements, CompletionCheck } from '../task-completion';

describe('checkCompletionRequirements', () => {
  it('returns canComplete=true when both process and outcome evidence exist', () => {
    const items = [
      { type: 'EVIDENCE_ITEM' },
      { type: 'OUTCOME' },
    ];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: true,
      missingProcess: false,
      missingOutcome: false,
    });
  });

  it('returns canComplete=true with NOTE as process and FOLLOW_UP as outcome', () => {
    const items = [
      { type: 'NOTE' },
      { type: 'FOLLOW_UP' },
    ];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: true,
      missingProcess: false,
      missingOutcome: false,
    });
  });

  it('returns missingOutcome when only process evidence exists', () => {
    const items = [{ type: 'EVIDENCE_ITEM' }];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: false,
      missingProcess: false,
      missingOutcome: true,
    });
  });

  it('returns missingProcess when only outcome evidence exists', () => {
    const items = [{ type: 'OUTCOME' }];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: false,
      missingProcess: true,
      missingOutcome: false,
    });
  });

  it('returns both missing when evidence list is empty', () => {
    const result = checkCompletionRequirements([]);
    expect(result).toEqual<CompletionCheck>({
      canComplete: false,
      missingProcess: true,
      missingOutcome: true,
    });
  });

  it('returns both missing when items have unrecognized types', () => {
    const items = [{ type: 'UNKNOWN' }, { type: 'OTHER' }];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: false,
      missingProcess: true,
      missingOutcome: true,
    });
  });

  it('handles multiple items of the same type', () => {
    const items = [
      { type: 'NOTE' },
      { type: 'NOTE' },
      { type: 'FOLLOW_UP' },
      { type: 'FOLLOW_UP' },
    ];
    const result = checkCompletionRequirements(items);
    expect(result).toEqual<CompletionCheck>({
      canComplete: true,
      missingProcess: false,
      missingOutcome: false,
    });
  });
});
