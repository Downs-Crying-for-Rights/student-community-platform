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

export const TERMINAL_STATES: TaskStatus[] = ['COMPLETED', 'REJECTED', 'CLOSED', 'DISPUTED'];
const ABSOLUTE_TERMINAL_STATES: TaskStatus[] = TERMINAL_STATES;

const DISPUTABLE_STATES: TaskStatus[] = ['CLAIMED', 'IN_PROGRESS', 'EVIDENCE_PENDING'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (ABSOLUTE_TERMINAL_STATES.includes(from)) return false;
  if (to === 'DISPUTED') return DISPUTABLE_STATES.includes(from);
  if (to === 'REJECTED' || to === 'CLOSED') return true;
  return FORWARD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStates(current: TaskStatus): TaskStatus[] {
  if (current === 'COMPLETED' || TERMINAL_STATES.includes(current)) return [];
  return [
    ...(FORWARD_TRANSITIONS[current] ?? []),
    'REJECTED',
    'CLOSED',
    ...(DISPUTABLE_STATES.includes(current) ? ['DISPUTED' as const] : []),
  ];
}

export type HelpSessionStatus = 'CLAIMED' | 'IN_PROGRESS' | 'EVIDENCE_PENDING' | 'COMPLETED' | 'CLOSED' | 'DISPUTED';

const RESTORABLE_SESSION_STATES: HelpSessionStatus[] = ['CLAIMED', 'IN_PROGRESS', 'EVIDENCE_PENDING'];
export type RestorableHelpSessionStatus = 'CLAIMED' | 'IN_PROGRESS' | 'EVIDENCE_PENDING';

export function restoreHelpSessionStatus(statusBeforeDispute: HelpSessionStatus | null): RestorableHelpSessionStatus {
  return statusBeforeDispute && RESTORABLE_SESSION_STATES.includes(statusBeforeDispute)
    ? statusBeforeDispute as RestorableHelpSessionStatus
    : 'IN_PROGRESS';
}

export function aggregateHelpSessionStatus(statuses: HelpSessionStatus[]): TaskStatus {
  if (statuses.includes('DISPUTED')) return 'DISPUTED';
  const active = statuses.filter((status) => status !== 'COMPLETED' && status !== 'CLOSED');
  if (active.includes('EVIDENCE_PENDING')) return 'EVIDENCE_PENDING';
  if (active.includes('IN_PROGRESS')) return 'IN_PROGRESS';
  if (active.includes('CLAIMED')) return 'CLAIMED';
  if (statuses.includes('COMPLETED')) return 'COMPLETED';
  return 'OPEN';
}
