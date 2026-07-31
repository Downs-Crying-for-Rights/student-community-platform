import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  record: vi.fn(),
  release: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/qq-official", () => ({
  completeQQOfficialEvent: mocks.complete,
  recordQQOfficialEvent: mocks.record,
  releaseQQOfficialEvent: mocks.release,
  sendQQOfficialReply: mocks.send,
}));

import { processQQOfficialEvent } from "./qq-official-events";

describe("processQQOfficialEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.record.mockResolvedValue({ status: "ACQUIRED", leaseToken: "lease-1" });
    mocks.send.mockResolvedValue(undefined);
    mocks.complete.mockResolvedValue(true);
    mocks.release.mockResolvedValue(undefined);
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
      d: { id: "message-1", author: { user_openid: "openid-1" } },
    };
    await expect(processQQOfficialEvent(payload)).resolves.toEqual({ status: "DELIVERED" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      targetType: "user", targetId: "openid-1", messageId: "message-1",
    }));
    expect(mocks.complete).toHaveBeenCalledWith("event-1", "C2C_MESSAGE_CREATE", "lease-1");
  });

  it("releases the event lease when sending fails", async () => {
    mocks.send.mockRejectedValue(new Error("unavailable"));
    const result = await processQQOfficialEvent({
      op: 0,
      id: "event-1",
      t: "GROUP_AT_MESSAGE_CREATE",
      d: { id: "message-1", group_openid: "group-1" },
    });
    expect(result).toEqual({ status: "REPLY_FAILED" });
    expect(mocks.release).toHaveBeenCalledWith("event-1", "lease-1");
  });
});
