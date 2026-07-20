export type DcrCurrentStep = "PHONE" | "QUIZ" | "CASE" | "REVIEW" | "COMPLETE";
export type DcrApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface DcrLinkedCaseSummary {
  id: string;
  category: string;
  status: string;
  requestStatus: string;
  reviewNote: string | null;
  updatedAt: string;
}

export interface DcrApplicationSummary {
  id: string;
  status: DcrApplicationStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  caseId: string | null;
  caseLinkMissing: boolean;
}

export interface DcrBlocker {
  code: string;
  message: string;
  href?: string;
  cta?: string;
}

export interface DcrAdmissionProgress {
  accessGranted: boolean;
  phoneVerified: boolean;
  quizPassed: boolean;
  currentStep: DcrCurrentStep;
  linkedCase: DcrLinkedCaseSummary | null;
  application: DcrApplicationSummary | null;
  blockers: DcrBlocker[];
  capabilities: {
    canCreateDcrPost: boolean;
    canSubmitDelegation: boolean;
    canUseWorkspace: boolean;
  };
}

export interface DcrWorkspaceItem {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  href: string;
}

export interface DcrWorkspaceSection {
  count: number;
  todoCount: number;
  recent: DcrWorkspaceItem[];
}

export interface DcrProgressDto {
  admission: DcrAdmissionProgress;
  workspace: {
    cases: DcrWorkspaceSection;
    tasks: DcrWorkspaceSection;
    cycles: DcrWorkspaceSection;
  };
}

export interface CurrentStepInput {
  accessGranted: boolean;
  phoneVerified: boolean;
  quizPassed: boolean;
  hasLinkedCase: boolean;
}

/** Sequential admission mapping used by both the API and UI contract tests. */
export function getDcrCurrentStep(input: CurrentStepInput): DcrCurrentStep {
  if (input.accessGranted) return "COMPLETE";
  if (!input.phoneVerified) return "PHONE";
  if (!input.quizPassed) return "QUIZ";
  if (!input.hasLinkedCase) return "CASE";
  return "REVIEW";
}

export type DcrEntryMode = "LOADING" | "ERROR" | "ADMISSION" | "WORKSPACE";

export function getDcrEntryMode(
  admission: DcrAdmissionProgress | null,
  loading = false,
  hasError = false,
): DcrEntryMode {
  if (loading) return "LOADING";
  if (hasError || !admission) return "ERROR";
  return admission.accessGranted ? "WORKSPACE" : "ADMISSION";
}

export const DCR_ADMISSION_STEPS = [
  { key: "PHONE", title: "验证手机号" },
  { key: "QUIZ", title: "完成入频考核" },
  { key: "CASE", title: "提交委托" },
  { key: "REVIEW", title: "等待准入审核" },
] as const;

export const DCR_STEP_CTA: Record<Exclude<DcrCurrentStep, "COMPLETE">, { label: string; href: string }> = {
  PHONE: { label: "验证手机号", href: "/bindphone?callbackUrl=/dcr" },
  QUIZ: { label: "开始入频考核", href: "/dcr/quiz" },
  CASE: { label: "填写委托表", href: "/dcr/delegate" },
  REVIEW: { label: "查看委托与审核状态", href: "/dcr/requests" },
};

export const DCR_WORKSPACE_CARDS = [
  {
    key: "cases",
    title: "我的求助",
    description: "查看委托审核进度，补充材料或发起新的信息求助。",
    href: "/dcr/requests",
    cta: "管理我的求助",
  },
  {
    key: "tasks",
    title: "互助任务",
    description: "跟进自己发起或作为互助人参与的任务。",
    href: "/dcr/tasks",
    cta: "进入互助任务",
  },
  {
    key: "cycles",
    title: "互助闭环",
    description: "查看自己发起或参与的双方、三方互助闭环。",
    href: "/dcr/cycles",
    cta: "查看互助闭环",
  },
] as const;
