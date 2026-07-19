import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AiProviderError, requestDeepSeekReview } from "../deepseek";

const validResult = {
  riskLevel: "LOW",
  confidence: 0.99,
  recommendation: "APPROVE",
  categories: [],
  summary: "未发现明显风险",
  reasons: ["内容为普通交流"],
  evidence: [],
  missingInformation: [],
  suggestedReason: "",
  requiresHumanReview: false,
};

describe("DeepSeek review client", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_ENABLED", "true");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com");
    vi.stubEnv("DEEPSEEK_DEFAULT_MODEL", "deepseek-v4-flash");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requests JSON output without exposing model configuration to callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validResult) } }],
      usage: { total_tokens: 42 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeepSeekReview({ systemPrompt: "output json", content: "test", userId: "u_safe" });
    expect(response.result).toEqual(validResult);
    expect(response.model).toBe("deepseek-v4-flash");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.user_id).toBe("u_safe");
  });

  it("uses Flash for complex reviews as well", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validResult) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestDeepSeekReview({
      systemPrompt: "output json",
      content: "complex review",
      userId: "u_safe",
      complex: true,
    });

    expect(response.model).toBe("deepseek-v4-flash");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).model).toBe("deepseek-v4-flash");
  });

  it("rejects malformed model output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(requestDeepSeekReview({ systemPrompt: "json", content: "test", userId: "u_safe" }))
      .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" } satisfies Partial<AiProviderError>);
  });

  it("fails closed when AI is disabled", async () => {
    vi.stubEnv("DEEPSEEK_ENABLED", "false");
    await expect(requestDeepSeekReview({ systemPrompt: "json", content: "test", userId: "u_safe" }))
      .rejects.toMatchObject({ code: "AI_DISABLED", status: 503 } satisfies Partial<AiProviderError>);
  });

  it("retries one transient provider failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validResult) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestDeepSeekReview({ systemPrompt: "json", content: "test", userId: "u_safe" })).resolves.toMatchObject({ result: validResult });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
