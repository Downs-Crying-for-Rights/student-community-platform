export type DcrApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "NONE";

/**
 * Resolve DCR access from both the cached browser session and real-time APIs.
 * Database-backed progress/application state wins when the JWT is stale.
 */
export function hasEffectiveDcrAccess(
  sessionAccess: boolean,
  progressAccess: boolean,
  applicationStatus: DcrApplicationStatus,
): boolean {
  return sessionAccess || progressAccess || applicationStatus === "APPROVED";
}
