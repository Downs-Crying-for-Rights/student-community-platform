export type DcrCapabilitySubject = {
  role?: string;
  dcrAccess: boolean;
  dcrPledgeSigned?: boolean;
  dcrContributionAccess?: boolean;
};

export function canUseDcrWorkspace(user: DcrCapabilitySubject): boolean {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN" || (user.dcrAccess && user.dcrPledgeSigned === true);
}

export function canParticipateInDcrWorkflow(user: DcrCapabilitySubject): boolean {
  return canUseDcrWorkspace(user);
}

export function canCreateDcrPost(user: DcrCapabilitySubject): boolean {
  return canUseDcrWorkspace(user) || user.dcrContributionAccess === true;
}

export function canSubmitDcrDelegation(user: DcrCapabilitySubject): boolean {
  if (user.role === "DCR_HELPER") return false;
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.dcrAccess || user.dcrContributionAccess === true;
}
