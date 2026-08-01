import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  record: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/qq-official", () => ({
  completeQQOfficialEvent: mocks.complete,
  recordQQOfficialEvent: mocks.record,
  releaseQQOfficialEvent: mocks.release,
  sendQQOfficialReply: mocks.send,
  getQQOfficialConfig: () => ({ appId: "11111111" }),
}));
vi.mock("@/lib/qq-bot-service", () => ({ processQQBotMessage: mocks.process }));

import { processQQOfficialEvent } from "./qq-official-events";

describe("processQQOfficialEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.record.mockResolvedValue({ status: "ACQUIRED", leaseToken: "lease-1" });
    mocks.send.mockResolvedValue(undefined);
    mocks.complete.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
    mocks.process.mockResolvedValue({
      duplicate: false,
      replies: ["可用命令：帮助、绑定、注册、状态、新建委托、取消、草稿。"],
      conversation: { state: "idle", revision: "1", prompt: null },
    });
  });

  it("ignores non-message gateway dispatches", async () => {
    await expect(processQQOfficialEvent({ op: 0, id: "ready-1", t: "READY", d: {} }))
      .resolves.toEqual({ status: "IGNORED" });
  });

  it("replies to C2C messages and completes the event lease", async () => {
    const payload = {
      op: 0,
      id: "event-1",
      t: "C2C_MESSAGE_CREATE",
      d: { id: "message-1", content: "帮助", timestamp: "2026-08-01T00:00:00+08:00", author: { user_openid: "openid-1" } },
    };
    await expect(processQQOfficialEvent(payload)).resolves.toEqual({ status: "DELIVERED" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "user", targetId: "openid-1", messageId: "message-1",
    }));
    expect(mocks.process).toHaveBeenCalledWith({
      version: 1,
      eventId: "11111111:official:event-1",
      platform: "qq_official",
      selfId: "11111111",
      userId: "openid-1",
      occurredAt: "2026-07-31T16:00:00.000Z",
      conversation: { type: "private" },
      input: { type: "command", command: "帮助" },
    });
    expect(mocks.complete).toHaveBeenCalledWith("event-1", "C2C_MESSAGE_CREATE", "lease-1");
  });

  it("treats official group mentions as AI-only text and never runs account commands", async () => {
    await expect(processQQOfficialEvent({
      op: 0,
      id: "event-group",
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "message-group", content: "状态", group_openid: "group-1" },
    })).resolves.toEqual({ status: "DELIVERED" });
    expect(mocks.process).toHaveBeenCalledWith({
      version: 1,
      eventId: "11111111:official:event-group",
      platform: "qq_official",
      selfId: "11111111",
      userId: "group-1",
      occurredAt: expect.any(String),
      conversation: { type: "group", groupId: "group-1" },
      input: { type: "text", text: "状态" },
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "group",
      content: "可用命令：帮助、绑定、注册、状态、新建委托、取消、草稿。",
    }));
  });

  it("strips the bot mention before sending group text to the AI", async () => {
    mocks.process.mockResolvedValue({
      duplicate: false,
      replies: ["AI 回复"],
      conversation: { state: "idle", revision: "1", prompt: null },
    });
    await expect(processQQOfficialEvent({
      op: 0,
      id: "event-mention",
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "message-mention", content: "<@!123456789012345678> 你好", group_openid: "group-1" },
    })).resolves.toEqual({ status: "DELIVERED" });
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({
      input: { type: "text", text: "你好" },
      conversation: { type: "group", groupId: "group-1" },
    }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "group",
      content: "AI 回复",
    }));
  });

  it("releases the event lease when sending fails", async () => {
    mocks.send.mockRejectedValue(new Error("unavailable"));
    const result = await processQQOfficialEvent({
      op: 0,
      id: "event-1",
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "message-1", content: "帮助", group_openid: "group-1" },
    });
    expect(result).toEqual({ status: "REPLY_FAILED" });
    expect(mocks.release).toHaveBeenCalledWith("event-1", "lease-1");
  });
});
