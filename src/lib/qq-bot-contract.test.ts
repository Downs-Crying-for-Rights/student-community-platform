import { describe, expect, it } from "vitest";
import { isValidInternalBearer, qqBotMessageSchema } from "./qq-bot-contract";

const validMessage = {
  version: 1,
  eventId: "1000000000:123",
  platform: "onebot11",
  selfId: "1000000000",
  userId: "2000000000",
  occurredAt: "2026-07-19T10:00:00.000Z",
  input: { type: "command", command: "状态" },
};

describe("QQ bot internal contract", () => {
  it("accepts the exact worker request", () => {
    expect(qqBotMessageSchema.parse(validMessage)).toEqual(validMessage);
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
