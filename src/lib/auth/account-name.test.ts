import { describe, expect, it, vi } from "vitest";

import {
  buildNicknameIdentifierWhere,
  buildPrimaryAccountIdentifierWhere,
  findAccountNameConflict,
  normalizeAccountName,
} from "./account-name";

describe("account name availability", () => {
  it("normalizes whitespace, compatibility characters, and case", () => {
    expect(normalizeAccountName("  Ｔest_User  ")).toBe("test_user");
  });

  it("checks usernames and nicknames in one case-insensitive namespace", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "user-2" });
    const conflict = await findAccountNameConflict({ user: { findFirst } } as never, " Test_User ", "user-1");

    expect(conflict).toEqual({ id: "user-2" });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        deactivatedAt: null,
        id: { not: "user-1" },
        OR: [
          { username: { equals: "test_user", mode: "insensitive" } },
          { nickname: { equals: "test_user", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
  });

  it("keeps unique identifiers ahead of the nickname fallback", () => {
    expect(buildPrimaryAccountIdentifierWhere("Member@Example.COM")).toEqual({
      OR: [
        { email: "Member@Example.COM" },
        { email: "member@example.com" },
        { username: "member@example.com" },
        { phone: "Member@Example.COM" },
      ],
    });
    expect(buildNicknameIdentifierWhere(" Member ")).toEqual({
      nickname: { equals: "member", mode: "insensitive" },
    });
  });
});
