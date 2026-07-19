import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/redis", () => ({ default: { get: mocks.get, set: mocks.set } }));

import { getQQBotHeartbeat, QQ_BOT_HEARTBEAT_TTL_SECONDS, recordQQBotHeartbeat } from "./qq-bot-monitor";

describe("QQ bot heartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a short-lived worker heartbeat", async () => {
    mocks.set.mockResolvedValue("OK");
    await recordQQBotHeartbeat("3917673573", new Date("2026-07-19T10:00:00.000Z"));
    expect(mocks.set).toHaveBeenCalledWith(
      "qq-bot:worker:heartbeat",
      JSON.stringify({ selfId: "3917673573", recordedAt: "2026-07-19T10:00:00.000Z" }),
      "EX",
      QQ_BOT_HEARTBEAT_TTL_SECONDS,
    );
  });

  it("returns null for missing, invalid, or unavailable heartbeat data", async () => {
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce("invalid").mockRejectedValueOnce(new Error("offline"));
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
  });
});
