import { describe, expect, it } from "vitest";
import {
  DCR_COLD_START_LIMIT,
  evaluateDcrAdmission,
  type DcrAdmissionApplication,
  type DcrAdmissionCase,
  type DcrAdmissionUser,
} from "@/lib/dcr-admission-policy";

const now = new Date("2026-07-17T00:00:00.000Z");

const eligibleUser: DcrAdmissionUser = {
  id: "user-1",
  role: "USER",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  phone: "13800138000",
  quizPassed: true,
  violationCount: 0,
  dcrAccess: false,
  dcrPledgeSigned: false,
};

const approvedCase: DcrAdmissionCase = {
  id: "case-1",
  submitterId: "user-1",
  requestStatus: "APPROVED",
};

const pendingApplication: DcrAdmissionApplication = {
  id: "app-1",
  applicantId: "user-1",
  caseId: "case-1",
  status: "PENDING",
  pledgeText: "已移除可识别信息，了解平台不组织不指挥不实施",
};

describe("evaluateDcrAdmission", () => {
  it("未绑定手机号时不能参加入频考核", () => {
    const decision = evaluateDcrAdmission({
      stage: "START_QUIZ",
      user: { ...eligibleUser, phone: null },
    });

    expect(decision).toMatchObject({ allowed: false, code: "PHONE_REQUIRED" });
  });

  it("通过考核且无待审申请时可以提交委托", () => {
    expect(evaluateDcrAdmission({
      stage: "SUBMIT_CASE",
      user: eligibleUser,
      hasOtherPendingApplication: false,
    }).allowed).toBe(true);
  });

  it("DCR 申请必须关联明确委托", () => {
    const decision = evaluateDcrAdmission({
      stage: "APPROVE_APPLICATION",
      user: eligibleUser,
      application: { ...pendingApplication, caseId: null },
      case: null,
      activeDcrUserCount: 0,
      now,
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "APPLICATION_CASE_UNLINKED",
    });
  });

  it("申请不能关联其他用户的委托", () => {
    const decision = evaluateDcrAdmission({
      stage: "APPROVE_APPLICATION",
      user: eligibleUser,
      application: pendingApplication,
      case: { ...approvedCase, submitterId: "other-user" },
      activeDcrUserCount: 0,
      now,
    });

    expect(decision).toMatchObject({ allowed: false, code: "CASE_NOT_OWNED" });
  });

  it("不使用信誉分，满足明确条件即可批准", () => {
    const context = {
      stage: "APPROVE_APPLICATION" as const,
      user: eligibleUser,
      application: pendingApplication,
      case: approvedCase,
      activeDcrUserCount: 0,
      now,
    };

    expect(evaluateDcrAdmission(context).allowed).toBe(true);
  });

  it("冷启动上限达到时拒绝批准", () => {
    const decision = evaluateDcrAdmission({
      stage: "APPROVE_APPLICATION",
      user: eligibleUser,
      application: pendingApplication,
      case: approvedCase,
      activeDcrUserCount: DCR_COLD_START_LIMIT,
      now,
    });

    expect(decision).toMatchObject({ allowed: false, code: "DCR_CAPACITY_REACHED" });
  });

  it("申请 APPROVED 不能替代真实 DCR 权限", () => {
    expect(evaluateDcrAdmission({
      stage: "USE_DCR",
      user: eligibleUser,
      application: { ...pendingApplication, status: "APPROVED" },
    })).toMatchObject({ allowed: false, code: "ACCESS_NOT_GRANTED" });
  });

  it("真实访问要求 dcrAccess 与守则签署同时成立", () => {
    expect(evaluateDcrAdmission({
      stage: "USE_DCR",
      user: { ...eligibleUser, dcrAccess: true, dcrPledgeSigned: true },
    }).allowed).toBe(true);
  });
});
