import { computeTrustLevel, type TrustLevel } from "@/lib/trust-level";

export const DCR_MIN_ACCOUNT_AGE_DAYS = 7;
export const DCR_MIN_TRUST_LEVEL: TrustLevel = 2;
export const DCR_MAX_VIOLATION_COUNT_EXCLUSIVE = 3;
export const DCR_COLD_START_LIMIT = 50;

export type DcrAdmissionStage =
  | "START_QUIZ"
  | "SUBMIT_CASE"
  | "CREATE_APPLICATION"
  | "APPROVE_APPLICATION"
  | "USE_DCR";

export type DcrAdmissionCode =
  | "PHONE_REQUIRED"
  | "QUIZ_REQUIRED"
  | "ACCOUNT_TOO_NEW"
  | "TRUST_LEVEL_TOO_LOW"
  | "TOO_MANY_VIOLATIONS"
  | "CASE_REQUIRED"
  | "CASE_NOT_OWNED"
  | "CASE_NOT_APPROVED"
  | "APPLICATION_ALREADY_PENDING"
  | "APPLICATION_NOT_PENDING"
  | "APPLICATION_CASE_UNLINKED"
  | "DCR_CAPACITY_REACHED"
  | "PLEDGE_NOT_SIGNED"
  | "ACCESS_NOT_GRANTED";

export interface DcrAdmissionUser {
  id: string;
  role?: string;
  createdAt?: Date | string;
  phone?: string | null;
  phoneVerified?: boolean;
  quizPassed: boolean;
  reputationScore?: number | null;
  violationCount?: number;
  dcrAccess: boolean;
  dcrPledgeSigned?: boolean;
}

export interface DcrAdmissionCase {
  id: string;
  submitterId: string;
  requestStatus: string;
}

export interface DcrAdmissionApplication {
  id: string;
  applicantId: string;
  caseId: string | null;
  status: string;
  pledgeText?: string | null;
}

export interface DcrAdmissionContext {
  stage: DcrAdmissionStage;
  user: DcrAdmissionUser;
  case?: DcrAdmissionCase | null;
  application?: DcrAdmissionApplication | null;
  hasOtherPendingApplication?: boolean;
  activeDcrUserCount?: number;
  now?: Date;
}

export type DcrAdmissionDecision =
  | {
      allowed: true;
      stage: DcrAdmissionStage;
      requirements: string[];
    }
  | {
      allowed: false;
      stage: DcrAdmissionStage;
      code: DcrAdmissionCode;
      reason: string;
      next?: string;
      requirements: string[];
    };

const REQUIREMENTS = [
  "完成手机号验证",
  "通过 DCR 入频考核",
  "提交并通过委托审核",
  "通过管理员准入审核",
];

function allow(stage: DcrAdmissionStage): DcrAdmissionDecision {
  return { allowed: true, stage, requirements: REQUIREMENTS };
}

function deny(
  stage: DcrAdmissionStage,
  code: DcrAdmissionCode,
  reason: string,
  next?: string,
): DcrAdmissionDecision {
  return { allowed: false, stage, code, reason, next, requirements: REQUIREMENTS };
}

function hasVerifiedPhone(user: DcrAdmissionUser): boolean {
  return user.phoneVerified === true || Boolean(user.phone);
}

function accountAgeDays(user: DcrAdmissionUser, now: Date): number {
  if (!user.createdAt) return 0;
  const createdAt = user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt);
  if (Number.isNaN(createdAt.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
}

function requirePhoneAndQuiz(
  stage: DcrAdmissionStage,
  user: DcrAdmissionUser,
): DcrAdmissionDecision | null {
  if (!hasVerifiedPhone(user)) {
    return deny(stage, "PHONE_REQUIRED", "请先完成手机号验证", "/bindphone?callbackUrl=/dcr");
  }
  if (!user.quizPassed) {
    return deny(stage, "QUIZ_REQUIRED", "请先完成 DCR 入频考核", "/dcr/quiz");
  }
  return null;
}

function requireLinkedOwnedCase(
  stage: DcrAdmissionStage,
  user: DcrAdmissionUser,
  caseRecord: DcrAdmissionCase | null | undefined,
  application?: DcrAdmissionApplication | null,
): DcrAdmissionDecision | null {
  if (application && !application.caseId) {
    return deny(
      stage,
      "APPLICATION_CASE_UNLINKED",
      "该 DCR 准入申请未关联明确委托，需由管理员修复后再处理",
    );
  }
  if (!caseRecord) {
    return deny(stage, "CASE_REQUIRED", "请先提交一份明确的 DCR 委托", "/dcr/delegate");
  }
  if (caseRecord.submitterId !== user.id || (application && application.applicantId !== user.id)) {
    return deny(stage, "CASE_NOT_OWNED", "准入申请关联的委托不属于申请人");
  }
  if (application?.caseId && application.caseId !== caseRecord.id) {
    return deny(stage, "APPLICATION_CASE_UNLINKED", "准入申请与委托关联不一致");
  }
  return null;
}

/**
 * DCR 准入的单一策略入口。该函数只做纯规则判断；数据库读取和事务由调用方负责。
 */
export function evaluateDcrAdmission(context: DcrAdmissionContext): DcrAdmissionDecision {
  const { stage, user, application, case: caseRecord } = context;
  const now = context.now ?? new Date();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  if (stage === "USE_DCR") {
    if (isAdmin || (user.dcrAccess && user.dcrPledgeSigned === true)) return allow(stage);
    if (!user.dcrAccess) return deny(stage, "ACCESS_NOT_GRANTED", "未获得 DCR 区准入权限", "/dcr");
    return deny(stage, "PLEDGE_NOT_SIGNED", "尚未签署 DCR 私密区守则", "/dcr");
  }

  if (stage === "START_QUIZ") {
    if (isAdmin || user.dcrAccess) return allow(stage);
    if (!hasVerifiedPhone(user)) {
      return deny(stage, "PHONE_REQUIRED", "参加 DCR 入频考核前请先完成手机号验证", "/bindphone?callbackUrl=/dcr/quiz");
    }
    return allow(stage);
  }

  if (stage === "SUBMIT_CASE") {
    if (isAdmin || user.dcrAccess) return allow(stage);
    const prerequisite = requirePhoneAndQuiz(stage, user);
    if (prerequisite) return prerequisite;
    if (context.hasOtherPendingApplication) {
      return deny(stage, "APPLICATION_ALREADY_PENDING", "您已有待审核的 DCR 准入申请", "/dcr");
    }
    return allow(stage);
  }

  if (stage === "CREATE_APPLICATION") {
    const prerequisite = requirePhoneAndQuiz(stage, user);
    if (prerequisite) return prerequisite;
    const caseDecision = requireLinkedOwnedCase(stage, user, caseRecord, application);
    if (caseDecision) return caseDecision;
    if (context.hasOtherPendingApplication) {
      return deny(stage, "APPLICATION_ALREADY_PENDING", "您已有待审核的 DCR 准入申请", "/dcr");
    }
    return allow(stage);
  }

  if (!application || application.status !== "PENDING") {
    return deny(stage, "APPLICATION_NOT_PENDING", "该准入申请已被处理");
  }

  const prerequisite = requirePhoneAndQuiz(stage, user);
  if (prerequisite) return prerequisite;
  const caseDecision = requireLinkedOwnedCase(stage, user, caseRecord, application);
  if (caseDecision) return caseDecision;
  if (caseRecord?.requestStatus !== "APPROVED") {
    return deny(stage, "CASE_NOT_APPROVED", "关联的 DCR 委托尚未通过审核");
  }
  if (!application.pledgeText?.trim()) {
    return deny(stage, "PLEDGE_NOT_SIGNED", "申请人尚未签署 DCR 私密区守则");
  }
  if (accountAgeDays(user, now) < DCR_MIN_ACCOUNT_AGE_DAYS) {
    return deny(stage, "ACCOUNT_TOO_NEW", `申请人账号年龄不足 ${DCR_MIN_ACCOUNT_AGE_DAYS} 天`);
  }
  if ((user.violationCount ?? 0) >= DCR_MAX_VIOLATION_COUNT_EXCLUSIVE) {
    return deny(stage, "TOO_MANY_VIOLATIONS", "申请人违规记录过多");
  }
  if (computeTrustLevel(user.reputationScore) < DCR_MIN_TRUST_LEVEL) {
    return deny(stage, "TRUST_LEVEL_TOO_LOW", "申请人信誉等级不足");
  }
  if ((context.activeDcrUserCount ?? 0) >= DCR_COLD_START_LIMIT) {
    return deny(stage, "DCR_CAPACITY_REACHED", `DCR 区已达冷启动限额（${DCR_COLD_START_LIMIT} 名用户）`);
  }

  return allow(stage);
}
