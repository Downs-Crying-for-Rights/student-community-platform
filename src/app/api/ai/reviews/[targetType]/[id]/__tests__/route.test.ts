import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetServerSession = vi.fn();
const mockLoadTarget = vi.fn();
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockReview = vi.fn();
const mockRateLimit = vi.fn();
const mockAudit = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next-auth/next", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: {
    aiReview: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));
vi.mock("@/lib/ai/review-target", () => ({ loadAiReviewTarget: (...args: unknown[]) => mockLoadTarget(...args) }));
vi.mock("@/lib/ai/runtime-config", () => ({
  getAiConfig: vi.fn().mockResolvedValue({ enabled: true, apiKey: "test-key", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash", complexModel: "deepseek-v4-flash", timeoutMs: 25_000, maxInputChars: 12_000, maxOutputTokens: 1_800, revision: 1, source: "database" }),
  getAiPrompt: vi.fn().mockResolvedValue("test system prompt"),
}));
vi.mock("@/lib/ai/deepseek", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/deepseek")>();
  return { ...original, requestDeepSeekReview: (...args: unknown[]) => mockReview(...args) };
});
vi.mock("@/lib/rate-limiter", () => ({ enforceRateLimit: (...args: unknown[]) => mockRateLimit(...args) }));
vi.mock("@/lib/audit", () => ({
  AuditAction: {
    AI_REVIEW_REQUEST: "AI_REVIEW_REQUEST", AI_REVIEW_COMPLETE: "AI_REVIEW_COMPLETE",
    AI_REVIEW_FAILED: "AI_REVIEW_FAILED", AI_REVIEW_BLOCKED: "AI_REVIEW_BLOCKED",
  },
  logAudit: (...args: unknown[]) => mockAudit(...args),
}));
vi.mock("@/lib/telemetry", () => ({
  recordCompletedRequest: vi.fn(),
  sanitizeTelemetryDetail: (value: unknown) => String(value),
  trackServerTelemetryLater: vi.fn(),
}));

const result = {
  riskLevel: "LOW", confidence: 0.99, recommendation: "APPROVE", categories: [],
  summary: "普通内容", reasons: [], evidence: [], missingInformation: [], suggestedReason: "", requiresHumanReview: false,
};

function request() {
  return new NextRequest("http://localhost:3000/api/ai/reviews/POST/post1", { method: "POST" });
}

function setSession(role: string) {
  mockGetServerSession.mockResolvedValue({ user: { id: "mod1", role }, expires: new Date(Date.now() + 60_000).toISOString() });
}

describe("POST /api/ai/reviews/[targetType]/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    vi.stubEnv("DEEPSEEK_ENABLED", "true");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    mockRateLimit.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockLoadTarget.mockResolvedValue({
      targetType: "POST", targetId: "post1", targetVersion: "v1", feature: "content_moderation",
      containsPrivateData: false, complex: false, payload: { title: "普通帖子", content: "正常交流内容" },
    });
    mockReview.mockResolvedValue({ result, model: "deepseek-v4-flash", usage: { total_tokens: 10 } });
    mockUpsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve({ id: "review1", ...create }));
    mockAudit.mockResolvedValue({});
  });

  it("rejects unauthenticated and non-moderator users before loading content", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../route");
    expect((await POST(request(), { params: { targetType: "POST", id: "post1" } })).status).toBe(401);

    setSession("USER");
    expect((await POST(request(), { params: { targetType: "POST", id: "post1" } })).status).toBe(403);
    expect(mockLoadTarget).not.toHaveBeenCalled();
  });

  it("reuses a completed review without calling DeepSeek", async () => {
    setSession("MODERATOR");
    mockFindUnique.mockResolvedValue({ id: "cached", status: "COMPLETED", result });
    const { POST } = await import("../route");
    const response = await POST(request(), { params: { targetType: "POST", id: "post1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("redacts PII before invoking DeepSeek", async () => {
    setSession("MODERATOR");
    mockLoadTarget.mockResolvedValue({
      targetType: "POST", targetId: "post1", targetVersion: "v1", feature: "content_moderation",
      containsPrivateData: false, complex: false, payload: { content: "联系13800138000，我在高一3班" },
    });
    const { POST } = await import("../route");
    const response = await POST(request(), { params: { targetType: "POST", id: "post1" } });
    expect(response.status).toBe(200);
    expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("[PHONE]") }));
    expect(mockReview.mock.calls[0][0].content).not.toContain("13800138000");
    expect(mockReview.mock.calls[0][0].content).not.toContain("高一3班");
  });

  it("rejects model output that contains PII", async () => {
    setSession("MODERATOR");
    mockReview.mockResolvedValue({
      result: { ...result, summary: "请联系13800138000" },
      model: "deepseek-v4-flash",
      usage: { total_tokens: 10 },
    });
    const { POST } = await import("../route");
    const response = await POST(request(), { params: { targetType: "POST", id: "post1" } });
    expect(response.status).toBe(502);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("persists a validated AI result without storing the prompt", async () => {
    setSession("MODERATOR");
    const { POST } = await import("../route");
    const response = await POST(request(), { params: { targetType: "POST", id: "post1" } });
    expect(response.status).toBe(200);
    expect(mockReview).toHaveBeenCalledOnce();
    const upsert = mockUpsert.mock.calls[0][0];
    expect(upsert.create.result).toEqual(result);
    expect(upsert.create).not.toHaveProperty("prompt");
    expect(upsert.create).not.toHaveProperty("content");
  });
});
