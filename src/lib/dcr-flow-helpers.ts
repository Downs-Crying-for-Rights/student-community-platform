/**
 * DCR 四步准入流程状态计算
 *
 * 纯函数，根据用户的 Case 审核状态、考核状态和 DCR 访问权限
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
 * - quizPassed=false → 步骤 1（参加考核）
 * - 已通过考核但无 Case / Case 已关闭 → 步骤 2（填写委托表）
 * - Case 审核或处理中 → 步骤 3（等待管理员审核）
 * - dcrAccess=true → 步骤 4（准入完成）
 */
export function computeFlowStep(
  caseStatus: string | null,
  quizPassed: boolean,
  dcrAccess: boolean,
): 1 | 2 | 3 | 4 {
  if (dcrAccess) return 4;
  if (!quizPassed) return 1;
  if (caseStatus === null || caseStatus === 'CLOSED') return 2;
  return 3;
}
