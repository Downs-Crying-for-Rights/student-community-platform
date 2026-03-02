import { describe, it, expect } from "vitest";

/**
 * 合规文档页面逻辑测试
 *
 * 验证合规文档页面的核心逻辑：
 * - 文档标题检索
 * - 文档 ID 验证
 * - 四个文档完整性
 * - 文档内容结构
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5
 */

import {
  getDocumentTitle,
  getDocumentIds,
  isValidDocumentId,
  getDocumentContent,
  getDocumentCount,
  getAllDocuments,
} from "../policies/page";

/* ---------- Document Title Retrieval ---------- */

describe("文档标题检索", () => {
  it("返回用户协议标题 (需求 18.1)", () => {
    expect(getDocumentTitle("user-agreement")).toBe("用户协议");
  });

  it("返回社区规范标题 (需求 18.2)", () => {
    expect(getDocumentTitle("community-guidelines")).toBe("社区规范");
  });

  it("返回隐私政策标题 (需求 18.3)", () => {
    expect(getDocumentTitle("privacy-policy")).toBe("隐私政策");
  });

  it("返回免责声明标题 (需求 18.4)", () => {
    expect(getDocumentTitle("disclaimer")).toBe("免责声明");
  });

  it("无效 ID 返回空字符串", () => {
    expect(getDocumentTitle("nonexistent")).toBe("");
    expect(getDocumentTitle("")).toBe("");
  });
});

/* ---------- Document ID Validation ---------- */

describe("文档 ID 验证", () => {
  it("有效文档 ID 返回 true", () => {
    expect(isValidDocumentId("user-agreement")).toBe(true);
    expect(isValidDocumentId("community-guidelines")).toBe(true);
    expect(isValidDocumentId("privacy-policy")).toBe(true);
    expect(isValidDocumentId("disclaimer")).toBe(true);
  });

  it("无效文档 ID 返回 false", () => {
    expect(isValidDocumentId("invalid")).toBe(false);
    expect(isValidDocumentId("")).toBe(false);
    expect(isValidDocumentId("user_agreement")).toBe(false);
  });
});

/* ---------- All 4 Documents Listed ---------- */

describe("四个文档完整性", () => {
  it("包含恰好 4 个文档", () => {
    expect(getDocumentCount()).toBe(4);
    expect(getDocumentIds()).toHaveLength(4);
  });

  it("包含所有必需的文档 ID", () => {
    const ids = getDocumentIds();
    expect(ids).toContain("user-agreement");
    expect(ids).toContain("community-guidelines");
    expect(ids).toContain("privacy-policy");
    expect(ids).toContain("disclaimer");
  });

  it("每个文档都有标题和内容", () => {
    const docs = getAllDocuments();
    docs.forEach((doc) => {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.content.length).toBeGreaterThan(0);
      expect(doc.id.length).toBeGreaterThan(0);
    });
  });
});

/* ---------- Content Structure ---------- */

describe("文档内容结构", () => {
  it("用户协议包含账户注册、使用规则、终止条件 (需求 18.1)", () => {
    const content = getDocumentContent("user-agreement");
    expect(content).toContain("账户注册");
    expect(content).toContain("使用规则");
    expect(content).toContain("账户终止");
  });

  it("社区规范包含行为准则、禁止行为、处罚规则 (需求 18.2)", () => {
    const content = getDocumentContent("community-guidelines");
    expect(content).toContain("行为准则");
    expect(content).toContain("禁止行为");
    expect(content).toContain("处罚规则");
  });

  it("隐私政策包含数据收集、存储、使用、用户权利 (需求 18.3)", () => {
    const content = getDocumentContent("privacy-policy");
    expect(content).toContain("数据收集");
    expect(content).toContain("数据存储");
    expect(content).toContain("数据使用");
    expect(content).toContain("用户权利");
  });

  it("免责声明包含平台定位、责任限制、紧急求助资源 (需求 18.4)", () => {
    const content = getDocumentContent("disclaimer");
    expect(content).toContain("平台定位");
    expect(content).toContain("责任限制");
    expect(content).toContain("紧急求助资源");
  });

  it("免责声明明确平台不组织不指挥不实施 (需求 18.4)", () => {
    const content = getDocumentContent("disclaimer");
    expect(content).toContain("不组织");
    expect(content).toContain("不指挥");
    expect(content).toContain("不实施");
  });

  it("免责声明说明心理交流区为非医疗性质 (需求 18.4)", () => {
    const content = getDocumentContent("disclaimer");
    expect(content).toContain("非医疗性质");
  });

  it("无效 ID 返回空内容", () => {
    expect(getDocumentContent("nonexistent")).toBe("");
  });
});
