export interface CompletionCheck {
  canComplete: boolean;
  missingProcess: boolean;
  missingOutcome: boolean;
}

export function checkCompletionRequirements(
  evidenceItems: Array<{ type: string }>
): CompletionCheck {
  const hasProcess = evidenceItems.some(
    e => e.type === 'EVIDENCE_ITEM' || e.type === 'NOTE'
  );
  const hasOutcome = evidenceItems.some(
    e => e.type === 'OUTCOME' || e.type === 'FOLLOW_UP'
  );
  return {
    canComplete: hasProcess && hasOutcome,
    missingProcess: !hasProcess,
    missingOutcome: !hasOutcome,
  };
}
