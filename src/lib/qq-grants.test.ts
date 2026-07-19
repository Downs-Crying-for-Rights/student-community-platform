import { describe, expect, it, vi } from "vitest";

import {
  buildQQGrantConsumeWhere,
  consumeQQGrantAtomically,
  generateQQGrant,
  hashQQGrant,
} from "./qq-grants";

const hmacKey = Buffer.alloc(32, 7);

describe("QQ grants", () => {
  it("generates opaque high-entropy tokens", () => {
    const first = generateQQGrant();
    const second = generateQQGrant();

    expect(first).toMatch(/^qqg_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it("hashes tokens deterministically with a key", () => {
    const token = generateQQGrant();
    expect(hashQQGrant(token, hmacKey)).toBe(hashQQGrant(token, hmacKey));
    expect(hashQQGrant(token, hmacKey)).not.toBe(token);
  });

  it("builds a purpose-bound one-time consumption predicate", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    expect(buildQQGrantConsumeWhere("hash", "DELEGATION_SUBMIT", now)).toEqual({
      tokenHash: "hash",
      purpose: "DELEGATION_SUBMIT",
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    });
  });

  it("consumes through one conditional update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const token = generateQQGrant();
    const now = new Date("2026-07-19T12:00:00.000Z");

    await expect(
      consumeQQGrantAtomically(
        { updateMany },
        token,
        "IDENTITY_BIND",
        hmacKey,
        now,
      ),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany.mock.calls[0][0].where.purpose).toBe("IDENTITY_BIND");
    expect(updateMany.mock.calls[0][0].data).toEqual({ consumedAt: now });
  });

  it("reports an already consumed or invalid grant without a read race", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(
      consumeQQGrantAtomically(
        { updateMany },
        generateQQGrant(),
        "DELEGATION_SUBMIT",
        hmacKey,
      ),
    ).resolves.toBe(false);
  });
});
