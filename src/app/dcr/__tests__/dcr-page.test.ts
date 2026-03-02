import { describe, it, expect } from "vitest";

/**
 * DCR 入口页面逻辑测试
 *
 * 验证 DCR 入口页面的纯函数逻辑：
 * - 准入要求数据
 * - 合规声明数据
 * - 私密区说明内容
 *
 * Validates: Requirements 36.1
 */

import {
  getDCRRequirements,
  getDCRComplianceStatements,
  getDCRDescription,
} from "../page";

/* ---------- DCR Requirements ---------- */

describe("getDCRRequirements", () => {
  it("returns four requirements", () => {
    const requirements = getDCRRequirements();
    expect(requirements).toHaveLength(4);
  });

  it("each requirement has title and description", () => {
    const requirements = getDCRRequirements();
    for (const req of requirements) {
      expect(req.title).toBeTruthy();
      expect(req.description).toBeTruthy();
    }
  });

  it("includes account age requirement", () => {
    const requirements = getDCRRequirements();
    const ageReq = requirements.find((r) => r.title.includes("7 天"));
    expect(ageReq).toBeDefined();
    expect(ageReq!.description).toContain("注册满 7 天");
  });

  it("includes violation count requirement", () => {
    const requirements = getDCRRequirements();
    const violationReq = requirements.find((r) => r.title.includes("违规"));
    expect(violationReq).toBeDefined();
    expect(violationReq!.description).toContain("3 次");
  });

  it("includes reputation requirement", () => {
    const requirements = getDCRRequirements();
    const repReq = requirements.find((r) => r.title.includes("信誉"));
    expect(repReq).toBeDefined();
    expect(repReq!.description).toContain("60");
  });

  it("includes pledge signing requirement", () => {
    const requirements = getDCRRequirements();
    const pledgeReq = requirements.find((r) => r.title.includes("守则"));
    expect(pledgeReq).toBeDefined();
    expect(pledgeReq!.description).toContain("签署");
  });
});

/* ---------- DCR Compliance Statements ---------- */

describe("getDCRComplianceStatements", () => {
  it("returns a non-empty array of strings", () => {
    const statements = getDCRComplianceStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it("includes the core compliance statement about not organizing actions", () => {
    const statements = getDCRComplianceStatements();
    const core = statements.find((s) => s.includes("不组织"));
    expect(core).toBeDefined();
    expect(core).toContain("不指挥");
    expect(core).toContain("不实施");
  });

  it("includes minimal data principle statement", () => {
    const statements = getDCRComplianceStatements();
    const minimal = statements.find((s) => s.includes("最小化数据"));
    expect(minimal).toBeDefined();
  });

  it("includes desensitization requirement", () => {
    const statements = getDCRComplianceStatements();
    const desensitize = statements.find((s) => s.includes("脱敏"));
    expect(desensitize).toBeDefined();
  });
});

/* ---------- DCR Description ---------- */

describe("getDCRDescription", () => {
  it("returns a non-empty string", () => {
    const desc = getDCRDescription();
    expect(desc.length).toBeGreaterThan(0);
  });

  it("mentions rights information mutual aid", () => {
    const desc = getDCRDescription();
    expect(desc).toContain("权益信息互助");
  });

  it("mentions compliance ticket workflow", () => {
    const desc = getDCRDescription();
    expect(desc).toContain("合规工单流转");
  });

  it("mentions desensitization for privacy", () => {
    const desc = getDCRDescription();
    expect(desc).toContain("脱敏");
  });
});
