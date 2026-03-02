/**
 * DCR 四步互助流程状态计算
 *
 * 纯函数，根据用户的 Case 状态、考核通过状态和互助队伍访问权限
 * 计算当前所处的流程步骤。
 */

/* ========== Types ========== */

/** 流程状态 */
export interface FlowState {
  step: 1 | 2 | 3 | 4;
  delegationCase: { status: string } | null;
  quizPassed: boolean;
  dcrAccess: boolean;
  rejectionReason?: string;
}

/* ========== Pure Functions ========== */

/**
 * 根据用户状态计算当前流程步骤。
 *
 * - 无 Case 或 Case 为 CLOSED → 步骤 1（填写委托表）
 * - Case 为 OPENED 或 NEED_MORE_INFO → 步骤 2（等待审核）
 * - Case 为 IN_PROGRESS 且 quizPassed=false → 步骤 3（参加考核）
 * - quizPassed=true → 步骤 4（加入互助队伍）
 */
export function computeFlowStep(
  caseStatus: string | null,
  quizPassed: boolean,
  dcrAccess: boolean,
): 1 | 2 | 3 | 4 {
  if (quizPassed) return 4;
  if (caseStatus === null || caseStatus === 'CLOSED') return 1;
  if (caseStatus === 'OPENED' || caseStatus === 'NEED_MORE_INFO') return 2;
  if (caseStatus === 'IN_PROGRESS') return 3;
  return 1;
}
