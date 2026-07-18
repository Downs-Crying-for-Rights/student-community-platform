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

  it("没有自己的委托时仍可作为大好人帮助", () => {
    const detail = fs.readFileSync(path.resolve(__dirname, "../[id]/page.tsx"), "utf8");

    expect(detail).toContain("作为大好人帮助");
    expect(detail).toContain("offeredTaskId: offeredTaskId || null");
    expect(detail).toContain('role={actionNotice.type === "error" ? "alert" : "status"}');
  });

  it("详情与聊天界面同时展示双方委托和无偿帮助状态", () => {
    const detail = fs.readFileSync(path.resolve(__dirname, "../[id]/page.tsx"), "utf8");
    const chat = fs.readFileSync(path.resolve(__dirname, "../[id]/chat/page.tsx"), "utf8");

    expect(detail).toContain("双方互助委托");
    expect(chat).toContain("双方互助委托");
    expect(detail).toContain("大好人无偿帮助");
    expect(chat).toContain("大好人无偿帮助");
  });
});
