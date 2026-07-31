import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getObject: vi.fn(),
  messageFindFirst: vi.fn(),
  evidenceFindFirst: vi.fn(),
  chatFindFirst: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  rateLimitKeyForIP: (ip: string) => `hashed:${ip}`,
  requestIP: (request: Request) => request.headers.get("x-real-ip") || "unknown",
}));

vi.mock("@/lib/oss", () => ({
  getMediaKey: () => null,
  getPrivateOSSObject: mocks.getObject,
  verifyMediaSignature: (_key: string, signature: string) => signature === "valid",
  verifyProtectedMediaSignature: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    message: { findFirst: mocks.messageFindFirst },
    evidenceItem: { findFirst: mocks.evidenceFindFirst },
    helpChatMessage: { findFirst: mocks.chatFindFirst },
  },
}));

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

function request(signature = "valid") {
  const key = "uploads/2026/07/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp";
  return new NextRequest(`http://localhost:3000/api/media?key=${encodeURIComponent(key)}&sig=${signature}`, {
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

describe("GET /api/media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.evidenceFindFirst.mockResolvedValue(null);
    mocks.chatFindFirst.mockResolvedValue(null);
    mocks.getObject.mockResolvedValue({
      ContentType: "image/webp",
      Body: { transformToByteArray: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) },
    });
  });

  it("rate limits OSS reads by hashed client IP", async () => {
    mocks.enforceRateLimit.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });
    const { GET } = await import("./route");
    const response = await GET(request(), { params: {} });

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("oss-media:public:hashed:203.0.113.10", 300, 60_000);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("does not spend a rate-limit entry for an invalid signature", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("invalid"), { params: {} });

    expect(response.status).toBe(404);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("returns the private object after validation and rate limiting", async () => {
    const { GET } = await import("./route");
    const response = await GET(request(), { params: {} });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(await response.arrayBuffer()).toEqual(Uint8Array.from([1, 2, 3]).buffer);
    expect(mocks.getObject).toHaveBeenCalledOnce();
  });
});
