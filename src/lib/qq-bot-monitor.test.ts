import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/redis", () => ({ default: { get: mocks.get, set: mocks.set, del: mocks.del } }));
vi.mock("@/lib/mail", () => ({ sendAdminActionMail: mocks.sendMail }));

import {
  alertQQBotReconnectFailure,
  getQQBotHeartbeat,
  QQ_BOT_HEARTBEAT_TTL_SECONDS,
  recordQQBotHeartbeat,
} from "./qq-bot-monitor";

describe("QQ bot heartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a short-lived worker heartbeat", async () => {
    mocks.set.mockResolvedValue("OK");
    await recordQQBotHeartbeat("3917673573", { oneBotConnected: true, accountOnline: false, checkedAt: "2026-07-19T09:59:59.000Z" }, new Date("2026-07-19T10:00:00.000Z"));
    expect(mocks.set).toHaveBeenCalledWith(
      "qq-bot:worker:heartbeat",
      JSON.stringify({ selfId: "3917673573", recordedAt: "2026-07-19T10:00:00.000Z", oneBotConnected: true, accountOnline: false, checkedAt: "2026-07-19T09:59:59.000Z" }),
      "EX",
      QQ_BOT_HEARTBEAT_TTL_SECONDS,
    );
  });

  it("sends one administrator email for a failed reconnect incident", async () => {
    mocks.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    mocks.sendMail.mockResolvedValue({ sent: true, recipientCount: 1 });
    const status = {
      accountOnline: false,
      reconnectAttemptedAt: "2026-07-19T10:00:00.000Z",
      reconnectFailed: true,
    };

    await alertQQBotReconnectFailure("3917673573", status);
    await alertQQBotReconnectFailure("3917673573", status);

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      minimumRole: "ADMIN",
      actionUrl: "/admin/qq-bot",
    }));
  });

  it("clears the incident dedupe key after account recovery", async () => {
    mocks.del.mockResolvedValue(1);
    await alertQQBotReconnectFailure("3917673573", { accountOnline: true });
    expect(mocks.del).toHaveBeenCalledWith("qq-bot:alert:login-failed:3917673573");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("allows a retry when administrator email delivery fails", async () => {
    mocks.set.mockResolvedValue("OK");
    mocks.sendMail.mockResolvedValue({ sent: false, recipientCount: 0, reason: "send_failed" });
    mocks.del.mockResolvedValue(1);

    await alertQQBotReconnectFailure("3917673573", {
      accountOnline: false,
      reconnectAttemptedAt: "2026-07-19T10:00:00.000Z",
      reconnectFailed: true,
    });

    expect(mocks.del).toHaveBeenCalledWith("qq-bot:alert:login-failed:3917673573");
  });

  it("returns null for missing, invalid, or unavailable heartbeat data", async () => {
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce("invalid").mockRejectedValueOnce(new Error("offline"));
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
    await expect(getQQBotHeartbeat()).resolves.toBeNull();
  });
});
