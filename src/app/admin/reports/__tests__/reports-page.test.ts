import { describe, expect, it } from "vitest";
import { getReportTarget } from "../page";

const base = {
  id: "report1",
  reason: "测试",
  details: null,
  resolution: null,
  status: "PENDING" as const,
  createdAt: new Date().toISOString(),
  reporter: { id: "user1", nickname: "用户一" },
  targetUser: null,
  targetPost: null,
  targetComment: null,
  targetTask: null,
  targetCaseMessage: null,
  targetHelpMessage: null,
  targetDmMessage: null,
  targetChatMessage: null,
  targetChatRoom: null,
};

describe("举报处理页面", () => {
  it("为群聊消息生成可访问目标", () => {
    expect(getReportTarget({
      ...base,
      targetChatMessage: { id: "message1", content: "违规消息", roomId: "room1" },
    })).toEqual({ label: "群聊消息", text: "违规消息", href: "/chat/room1" });
  });

  it("目标删除后仍提供稳定说明", () => {
    expect(getReportTarget(base)).toEqual({
      label: "已删除目标",
      text: "目标内容已被删除或脱敏",
    });
  });
});
