import { describe, expect, it, vi } from "vitest";

import {
  enqueueQQMessageForUser,
  getQQOutboxFailureDisposition,
  QQ_OUTBOX_INITIAL_RETRY_MS,
  QQ_OUTBOX_MAX_ATTEMPTS,
} from "./qq-outbox";

describe("QQ outbox", () => {
  it("uses exponential retries and fails at the attempt cap", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");

    expect(getQQOutboxFailureDisposition(1, now)).toEqual({
      status: "RETRY",
      nextAttemptAt: new Date(now.getTime() + QQ_OUTBOX_INITIAL_RETRY_MS),
    });
    expect(getQQOutboxFailureDisposition(3, now)).toEqual({
      status: "RETRY",
      nextAttemptAt: new Date(now.getTime() + QQ_OUTBOX_INITIAL_RETRY_MS * 4),
    });
    expect(getQQOutboxFailureDisposition(QQ_OUTBOX_MAX_ATTEMPTS, now)).toEqual({
      status: "FAILED",
      nextAttemptAt: now,
    });
  });

  it("skips users without a bound QQ identity", async () => {
    const createMany = vi.fn();
    const client = {
      qQIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
      qQMessageOutbox: { createMany },
    };

    await expect(
      enqueueQQMessageForUser(client, "user-1", "case:1", "content"),
    ).resolves.toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("inserts idempotently for a bound user", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const client = {
      qQIdentity: { findUnique: vi.fn().mockResolvedValue({ id: "identity-1" }) },
      qQMessageOutbox: { createMany },
    };

    await expect(
      enqueueQQMessageForUser(client, "user-1", "case:1", "content"),
    ).resolves.toBe(false);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ dedupeKey: "case:1", identityId: "identity-1", content: "content" }],
      skipDuplicates: true,
    });
  });
});
