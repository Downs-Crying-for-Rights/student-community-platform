export type TaskStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'OPEN'
  | 'CLAIMED' | 'IN_PROGRESS' | 'EVIDENCE_PENDING'
  | 'COMPLETED' | 'REJECTED' | 'CLOSED' | 'DISPUTED';

export const FORWARD_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['OPEN'],
  OPEN: ['CLAIMED'],
  CLAIMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['EVIDENCE_PENDING'],
  EVIDENCE_PENDING: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CLOSED: [],
  DISPUTED: [],
};

export const TERMINAL_STATES: TaskStatus[] = ['REJECTED', 'CLOSED', 'DISPUTED'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (TERMINAL_STATES.includes(to)) return true;
  return FORWARD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStates(current: TaskStatus): TaskStatus[] {
  return [...(FORWARD_TRANSITIONS[current] ?? []), ...TERMINAL_STATES];
}
