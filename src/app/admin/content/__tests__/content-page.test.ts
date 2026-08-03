import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("管理员内容页帖子状态调整", () => {
  it("要求填写操作原因并随状态一起提交", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain('window.prompt("请输入帖子状态调整原因：")');
    expect(source).toContain("JSON.stringify({ status, reason: reason.trim() })");
    expect(source).toContain('data.error || "帖子状态更新失败"');
  });

  it("在帖子表格展示审核通过人和审计时间", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(source).toContain('<th className="text-left p-3">审核通过</th>');
    expect(source).toContain("post.approvalAudit.operator.nickname");
    expect(source).toContain("post.approvalAudit.createdAt");
    expect(source).toContain("ID：{post.approvalAudit.operator.id}");
  });
});
