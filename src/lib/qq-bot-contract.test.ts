import { describe, expect, it } from "vitest";
import { isValidInternalBearer, qqBotMessageSchema, routeQQBotInput } from "./qq-bot-contract";

const validMessage = {
  version: 1,
  eventId: "1000000000:123",
  platform: "onebot11",
  selfId: "1000000000",
  userId: "2000000000",
  occurredAt: "2026-07-19T10:00:00.000Z",
  conversation: { type: "private" },
  input: { type: "command", command: "状态" },
};

describe("QQ bot internal contract", () => {
  it("accepts the exact worker request", () => {
    expect(qqBotMessageSchema.parse(validMessage)).toEqual(validMessage);
  });

  it("accepts only a bounded registration command argument", () => {
    const credential = `qqg_${"A".repeat(43)}`;
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      input: { type: "command", command: "注册", argument: credential },
    }).success).toBe(true);
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      input: { type: "command", command: "状态", argument: credential },
    }).success).toBe(false);
  });

  it("accepts a bounded group context for OneBot and official messages", () => {
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      eventId: "1000000000:group:300000000:123",
      conversation: { type: "group", groupId: "300000000" },
      input: { type: "text", text: "你好" },
    }).success).toBe(true);
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      eventId: "12345678901234567890:official:event-2",
      platform: "qq_official",
      selfId: "12345678901234567890",
      userId: "openid_Abc-123",
      conversation: { type: "group", groupId: "group_openid_123" },
      input: { type: "text", text: "你好" },
    }).success).toBe(true);
    expect(qqBotMessageSchema.safeParse({ ...validMessage, conversation: { type: "group", groupId: "bad" } }).success).toBe(false);
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      eventId: "12345678901234567890:official:event-2",
      platform: "qq_official",
      selfId: "12345678901234567890",
      userId: "openid_Abc-123",
      conversation: { type: "group", groupId: "bad" },
    }).success).toBe(false);
  });

  it("accepts official openids and routes the same command set", () => {
    expect(qqBotMessageSchema.safeParse({
      version: 1,
      eventId: "12345678901234567890:event-1",
      platform: "qq_official",
      selfId: "12345678901234567890",
      userId: "openid_Abc-123",
      occurredAt: validMessage.occurredAt,
      conversation: { type: "private" },
      input: validMessage.input,
    }).success).toBe(true);
    expect(routeQQBotInput("注册 qqg_token")).toEqual({ type: "command", command: "注册", argument: "qqg_token" });
    expect(routeQQBotInput("新建委托")).toEqual({ type: "command", command: "新建委托" });
    expect(routeQQBotInput("表单正文")).toEqual({ type: "text", text: "表单正文" });
  });

  it("rejects unknown properties, invalid QQ IDs, and unscoped events", () => {
    expect(qqBotMessageSchema.safeParse({ ...validMessage, extra: true }).success).toBe(false);
    expect(qqBotMessageSchema.safeParse({ ...validMessage, userId: "123" }).success).toBe(false);
    expect(qqBotMessageSchema.safeParse({ ...validMessage, eventId: "9999999999:123" }).success).toBe(false);
    expect(qqBotMessageSchema.safeParse({
      ...validMessage,
      input: { type: "command", command: "状态", argument: "unexpected" },
    }).success).toBe(false);
  });

  it("checks only an exact configured bearer token", () => {
    expect(isValidInternalBearer("Bearer internal-secret", "internal-secret")).toBe(true);
    expect(isValidInternalBearer("Bearer internal-secreu", "internal-secret")).toBe(false);
    expect(isValidInternalBearer("internal-secret", "internal-secret")).toBe(false);
    expect(isValidInternalBearer("Bearer anything", undefined)).toBe(false);
  });
});
