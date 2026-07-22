import { describe, expect, it, vi } from "vitest";
import { calculatePunishmentProjection } from "@/lib/punishment-service";
import { isCommunicationWrite } from "@/lib/punishment-policy";

const now = new Date("2026-07-22T12:00:00Z");
const base = { action: "APPLIED" as const, startsAt: new Date("2026-07-22T10:00:00Z"), createdAt: new Date("2026-07-22T10:00:00Z"), revokedAt: null };

describe("punishment policy", () => {
  it("projects active permanent and temporary punishments while ignoring expired records", () => {
    const projection = calculatePunishmentProjection([
      { ...base, id: "mute", type: "PERMANENT_MUTE", expiresAt: null },
      { ...base, id: "expired-ban", type: "TEMPORARY_BAN", expiresAt: new Date("2026-07-22T11:00:00Z") },
      { ...base, id: "ban", type: "TEMPORARY_BAN", expiresAt: new Date("2026-07-23T12:00:00Z") },
    ], now);
    expect(projection).toMatchObject({ isMuted: true, muteUntil: null, isBanned: true, banUntil: new Date("2026-07-23T12:00:00Z") });
  });

  it("preserves legacy apply/revoke history semantics", () => {
    const projection = calculatePunishmentProjection([
      { ...base, id: "apply", type: "ACCOUNT_BAN", expiresAt: null },
      { ...base, id: "revoke", type: "ACCOUNT_BAN", action: "REVOKED", expiresAt: null, createdAt: new Date("2026-07-22T11:00:00Z") },
    ], now);
    expect(projection.isBanned).toBe(false);
  });

  it("blocks communication writes but not support, acknowledgement, or settings", () => {
    expect(isCommunicationWrite("POST", "/api/posts")).toBe(true);
    expect(isCommunicationWrite("POST", "/api/dm/thread/t1")).toBe(true);
    expect(isCommunicationWrite("POST", "/api/support")).toBe(false);
    expect(isCommunicationWrite("POST", "/api/punishments/acknowledge")).toBe(false);
    expect(isCommunicationWrite("PATCH", "/api/users/u1")).toBe(false);
  });

  it("keeps a deactivated account permanently banned during projection refresh", async () => {
    const userFindUnique = vi.fn().mockResolvedValue({ deactivatedAt: new Date("2026-07-22T00:00:00Z") });
    const userUpdate = vi.fn().mockResolvedValue({ id: "deleted", isBanned: true });
    const userPunishmentFindMany = vi.fn().mockResolvedValue([]);
    const { recalculatePunishmentProjection } = await import("@/lib/punishment-service");

    await recalculatePunishmentProjection("deleted", {
      user: { findUnique: userFindUnique, update: userUpdate },
      userPunishment: { findMany: userPunishmentFindMany },
    } as never, now);

    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isBanned: true, banUntil: null, isMuted: false, muteUntil: null }),
    }));
  });
});
