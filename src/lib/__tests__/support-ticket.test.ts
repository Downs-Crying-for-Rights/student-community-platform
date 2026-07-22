import { describe, expect, it, vi } from "vitest";

const scanContent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sensitive-engine", () => ({ scanContent }));

import { readRequiredText } from "../support-ticket";
import { containsBlockedSupportWord } from "../support-ticket-server";

describe("support ticket content policy", () => {
  it("allows PII needed for private account support", async () => {
    scanContent.mockResolvedValue([{ word: "13800000000", category: "PII", startIndex: 0, endIndex: 11 }]);
    await expect(containsBlockedSupportWord("13800000000")).resolves.toBe(false);
  });

  it("blocks configured sensitive-word categories without returning matched content", async () => {
    scanContent.mockResolvedValue([{ word: "blocked-secret", category: "POLITICAL", startIndex: 0, endIndex: 14 }]);
    await expect(containsBlockedSupportWord("blocked-secret")).resolves.toBe(true);
  });

  it("trims and enforces text limits", () => {
    expect(readRequiredText("  account issue  ", 20)).toBe("account issue");
    expect(readRequiredText("", 20)).toBeNull();
    expect(readRequiredText("too long", 3)).toBeNull();
  });
});
