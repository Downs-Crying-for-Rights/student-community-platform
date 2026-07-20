import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ eval: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/redis", () => ({ default: mocks }));

import {
  claimQQBotOperation,
  enqueueQQBotOperation,
  recordQQBotOperationResult,
} from "./qq-bot-operations";

describe("QQ bot operation leases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the command while returning a leased claim", async () => {
    mocks.eval.mockResolvedValue(JSON.stringify({
      id: "f9c74a69-3b0f-4a13-b961-166aae661234",
      action: "REFRESH_LOGIN",
      requestedAt: "2026-07-20T10:00:00.000Z",
    }));
    const command = await claimQQBotOperation();
    expect(command).toMatchObject({ action: "REFRESH_LOGIN" });
    expect(command?.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(mocks.eval.mock.calls[0][0])).not.toContain("GETDEL");
    expect(String(mocks.eval.mock.calls[0][0])).toContain("EXPIRE");
  });

  it("accepts only a result holding the current lease", async () => {
    mocks.eval.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const result = {
      commandId: "f9c74a69-3b0f-4a13-b961-166aae661234",
      leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632",
      action: "REFRESH_LOGIN" as const,
      status: "SUCCEEDED" as const,
      updatedAt: "2026-07-20T10:00:01.000Z",
      message: "ok",
    };
    await expect(recordQQBotOperationResult(result)).resolves.toBe(false);
    await expect(recordQQBotOperationResult(result)).resolves.toBe(true);
    expect(String(mocks.eval.mock.calls[1][0])).toContain("parsed.action ~= ARGV[3]");
  });

  it("does not enqueue another command while one is retained", async () => {
    mocks.eval.mockResolvedValue(0);
    await expect(enqueueQQBotOperation("RESTART_WORKER")).resolves.toBeNull();
  });
});
