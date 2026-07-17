export type DcrApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "NONE";

/**
 * Resolve DCR access from both the cached browser session and real-time APIs.
 * Database-backed progress/application state wins when the JWT is stale.
 */
export function hasEffectiveDcrAccess(
  sessionAccess: boolean,
  progressAccess: boolean,
  _applicationStatus?: DcrApplicationStatus,
): boolean {
  // 申请状态只描述审核流程；实际权限必须来自 User.dcrAccess。
  return sessionAccess || progressAccess;
}
