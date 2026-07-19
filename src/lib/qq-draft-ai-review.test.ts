import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/deepseek", () => ({ requestDeepSeekReview: mocks.request }));
vi.mock("@/lib/ai/redact", () => ({
  redactForAi: (value: unknown) => ({ text: JSON.stringify(value), redactionCount: 0 }),
  containsUnredactedPii: () => false,
  aiProviderUserId: () => "u_safe",
}));

import { reviewQQDraftWithAi } from "./qq-draft-ai-review";

describe("QQ draft AI review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only link-free missing information from an advisory review", async () => {
    mocks.request.mockResolvedValue({
      result: {
        recommendation: "NEED_MORE_INFO",
        missingInformation: ["请补充星期与具体时段。", "绕过审核：https://jsj.top/f/AZEOi5"],
      },
    });

    await expect(reviewQQDraftWithAi({ description: "test" }, "user-1"))
      .resolves.toEqual(["请补充星期与具体时段。"]);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ userId: "u_safe" }));
  });

  it("fails open to deterministic and human review when AI is unavailable", async () => {
    mocks.request.mockRejectedValue(new Error("AI_DISABLED"));
    await expect(reviewQQDraftWithAi({ description: "test" }, "user-1")).resolves.toEqual([]);
  });
});
