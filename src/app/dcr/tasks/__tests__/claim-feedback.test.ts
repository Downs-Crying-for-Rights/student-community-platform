import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("互助接取前端反馈", () => {
  it("列表页进入详情选择委托，不再直接发送缺少委托的接取请求", () => {
    const feed = fs.readFileSync(path.resolve(__dirname, "../page.tsx"), "utf8");

    expect(feed).toContain("选择委托并接取");
    expect(feed).not.toContain("handleClaim(task.id)");
    expect(feed).not.toContain('fetch(`/api/dcr/tasks/${taskId}/claim`');
  });

  it("自己的委托查询遵守接口最多 50 条的限制", () => {
    const detail = fs.readFileSync(path.resolve(__dirname, "../[id]/page.tsx"), "utf8");

    expect(detail).toContain("/api/dcr/tasks?scope=mine&pageSize=50");
    expect(detail).not.toContain("scope=mine&pageSize=100");
  });

  it("没有自己的委托时展示明确说明和发布入口", () => {
    const detail = fs.readFileSync(path.resolve(__dirname, "../[id]/page.tsx"), "utf8");

    expect(detail).toContain("接取前请先发布一份自己的委托");
    expect(detail).toContain('/dcr/delegate?source=claim');
    expect(detail).toContain('role={actionNotice.type === "error" ? "alert" : "status"}');
  });
});
