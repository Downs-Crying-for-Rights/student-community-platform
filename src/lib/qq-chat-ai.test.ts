import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ chat: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/ai/deepseek", () => ({ requestDeepSeekChat: mocks.chat }));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: mocks.rateLimit }));

import { generateQQChatReply } from "./qq-chat-ai";

describe("QQ AI chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 11, resetAt: Date.now() + 60_000, limit: 12 });
    mocks.chat.mockResolvedValue({ content: "普通回答 [CQ:at,qq=all]", model: "deepseek-chat" });
  });

  it("uses a pseudonymous provider id and neutralizes outbound CQ codes", async () => {
    const reply = await generateQQChatReply({ text: "你好", identityKey: "raw-qq-identity-hash" });
    expect(mocks.chat).toHaveBeenCalledWith(expect.objectContaining({
      content: "你好",
      userId: expect.stringMatching(/^qq_[A-Za-z0-9_-]{40}$/),
    }));
    expect(mocks.chat.mock.calls[0][0].userId).not.toContain("raw-qq-identity-hash");
    expect(reply).toContain("［CQ:at,qq=all]");
    expect(reply).not.toContain("[CQ:");
  });

  it("does not call the provider after the per-identity limit is reached", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, limit: 12 });
    await expect(generateQQChatReply({ text: "你好", identityKey: "identity" }))
      .resolves.toBe("AI 对话请求过于频繁，请稍后再试。");
    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
