import { describe, expect, it } from "vitest";
import {
  canManageChatRoomMember,
  isActiveChatRoomBan,
  moderationBanExpiresAt,
} from "../chat-room-membership-policy";

describe("chat room membership policy", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("仅将未撤销且未过期的封禁视为 active", () => {
    expect(isActiveChatRoomBan({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isActiveChatRoomBan({ revokedAt: null, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isActiveChatRoomBan({ revokedAt: null, expiresAt: now }, now)).toBe(false);
    expect(isActiveChatRoomBan({ revokedAt: now, expiresAt: null }, now)).toBe(false);
  });

  it("OWNER 受保护，ADMIN 只能治理 MEMBER", () => {
    expect(canManageChatRoomMember("OWNER", "OWNER", false)).toBe(false);
    expect(canManageChatRoomMember("ADMIN", "ADMIN", false)).toBe(false);
    expect(canManageChatRoomMember("ADMIN", "MEMBER", false)).toBe(true);
    expect(canManageChatRoomMember("OWNER", "ADMIN", false)).toBe(true);
    expect(canManageChatRoomMember(null, "MEMBER", true)).toBe(true);
  });

  it("KICK 为 24 小时限制，BAN 永不过期", () => {
    expect(moderationBanExpiresAt("KICK", now)?.toISOString()).toBe("2026-07-18T12:00:00.000Z");
    expect(moderationBanExpiresAt("BAN", now)).toBeNull();
  });
});
