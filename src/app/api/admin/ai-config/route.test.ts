import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_QQ_DRAFT_PROMPT, DEFAULT_REVIEW_BASE_PROMPT, DEFAULT_TARGET_INSTRUCTIONS } from "@/lib/ai/prompts";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), validateUrl: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { aiRuntimeConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
vi.mock("@/lib/ai/config", async (original) => ({ ...(await original<typeof import("@/lib/ai/config")>()), validateAiBaseUrl: mocks.validateUrl }));
vi.mock("@/lib/ai/runtime-config", () => ({ getSystemSecretKey: () => Buffer.alloc(32, 3) }));
vi.mock("@/lib/audit", () => ({ AuditAction: { AI_CONFIG_UPDATE: "AI_CONFIG_UPDATE" }, AuditTargetType: { SYSTEM: "SYSTEM" }, logAudit: mocks.audit }));

const url = "http://localhost/api/admin/ai-config";
function updateRequest(apiKey?: string) {
  return new NextRequest(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    enabled: true, baseUrl: "https://api.example.com", defaultModel: "model-a", complexModel: "model-b",
    timeoutMs: 25_000, maxInputChars: 12_000, maxOutputTokens: 1_800,
    reviewBasePrompt: DEFAULT_REVIEW_BASE_PROMPT, targetInstructions: DEFAULT_TARGET_INSTRUCTIONS,
    qqDraftPrompt: DEFAULT_QQ_DRAFT_PROMPT, ...(apiKey ? { apiKey } : {}),
  }) });
}

describe("admin AI config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.validateUrl.mockResolvedValue("https://api.example.com");
    mocks.upsert.mockResolvedValue({ revision: 2 });
    mocks.audit.mockResolvedValue({});
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params: {} })).status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("never returns an environment API key", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    vi.stubEnv("DEEPSEEK_API_KEY", "super-secret-key");
    const { GET } = await import("./route");
    const response = await GET(new NextRequest(url), { params: {} });
    const body = await response.json();
    expect(body.config.hasApiKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("super-secret-key");
  });

  it("encrypts a replacement key and audits only metadata", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    const { PATCH } = await import("./route");
    const response = await PATCH(updateRequest("replacement-secret"), { params: {} });
    expect(response.status).toBe(200);
    const args = mocks.upsert.mock.calls[0][0];
    expect(args.update.apiKeyCiphertext).not.toContain("replacement-secret");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("replacement-secret");
  });

  it("rejects an unsafe provider URL", async () => {
    mocks.session.mockResolvedValue({ user: { id: "root", role: "SUPER_ADMIN" } });
    mocks.validateUrl.mockRejectedValue(new Error("unsafe"));
    const { PATCH } = await import("./route");
    expect((await PATCH(updateRequest(), { params: {} })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
