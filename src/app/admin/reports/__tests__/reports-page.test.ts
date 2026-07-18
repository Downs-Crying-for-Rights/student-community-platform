import { describe, expect, it } from "vitest";
import { getDefaultReportAction, getReportActions, getReportTarget } from "../page";

const base = {
  id: "report1",
  reason: "测试",
  details: null,
  resolution: null,
  status: "PENDING" as const,
  createdAt: new Date().toISOString(),
  reporter: { id: "user1", nickname: "用户一" },
  resolvedBy: null,
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

  it("帖子举报为管理员提供删除和处罚组合动作", () => {
    expect(getReportActions({
      ...base,
      targetPost: { id: "post1", title: "违规帖子", authorId: "author1" },
    }, true)).toEqual([
      "NONE",
      "DELETE_TARGET",
      "BAN_RESPONSIBLE_USER",
      "SHADOW_HIDE_RESPONSIBLE_USER",
      "DELETE_TARGET_AND_BAN_USER",
      "DELETE_TARGET_AND_SHADOW_HIDE_USER",
    ]);
  });

  it("版主只能删除内容，不能封禁用户", () => {
    expect(getReportActions({
      ...base,
      targetComment: { id: "comment1", content: "违规评论", authorId: "author1" },
    }, false)).toEqual(["NONE", "DELETE_TARGET"]);
  });

  it("帖子和评论举报默认删除目标，其他举报默认只记录结论", () => {
    expect(getDefaultReportAction({ ...base, targetPost: { id: "post1", title: "违规帖子" } })).toBe("DELETE_TARGET");
    expect(getDefaultReportAction({ ...base, targetUser: { id: "user2", nickname: "用户二" } })).toBe("NONE");
  });
});
