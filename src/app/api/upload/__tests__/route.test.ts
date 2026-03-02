import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/upload 路由测试
 *
 * 测试图片上传 API：
 * - 未登录返回 401
 * - 缺少文件返回 400
 * - 文件类型/大小校验
 * - 成功上传返回 { url }
 * - 上传失败返回 500
 */

// ==================== Mocks ====================

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

const mockEnforceRateLimit = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
}));

const mockValidateFile = vi.fn();
const mockCompressImage = vi.fn();
const mockGenerateObjectKey = vi.fn();
const mockUploadToOSS = vi.fn();

vi.mock("@/lib/oss", () => ({
  validateFile: (...args: unknown[]) => mockValidateFile(...args),
  compressImage: (...args: unknown[]) => mockCompressImage(...args),
  generateObjectKey: (...args: unknown[]) => mockGenerateObjectKey(...args),
  uploadToOSS: (...args: unknown[]) => mockUploadToOSS(...args),
}));

import { getServerSession } from "next-auth/next";
const mockGetServerSession = vi.mocked(getServerSession);

// ==================== Helpers ====================

function setSession(id: string, role: string) {
  mockGetServerSession.mockResolvedValue({
    user: { id, role },
  } as ReturnType<typeof getServerSession> extends Promise<infer T> ? T : never);
}

function makeUploadRequest(file?: Blob): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  return new NextRequest("http://localhost:3000/api/upload", {
    method: "POST",
    body: formData,
  });
}

// ==================== Tests ====================

beforeEach(() => {
  vi.clearAllMocks();
  mockEnforceRateLimit.mockResolvedValue(null);
  mockValidateFile.mockReturnValue(null);
  mockCompressImage.mockResolvedValue({
    data: Buffer.from("compressed"),
    contentType: "image/webp",
  });
  mockGenerateObjectKey.mockReturnValue("uploads/2026/02/abc123.webp");
  mockUploadToOSS.mockResolvedValue("https://cdn.example.com/uploads/2026/02/abc123.webp");
});

describe("POST /api/upload", () => {
  let POST: (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>;

  beforeEach(async () => {
    const mod = await import("../../upload/route");
    POST = mod.POST as typeof POST;
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns rate limit response when rate limited", async () => {
    setSession("user1", "USER");
    mockEnforceRateLimit.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "请求过于频繁" }), { status: 429 }),
    });
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(429);
  });

  it("returns 400 when no file provided", async () => {
    setSession("user1", "USER");
    const req = makeUploadRequest();
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when file validation fails", async () => {
    setSession("user1", "USER");
    mockValidateFile.mockReturnValue("不支持的图片格式");
    const req = makeUploadRequest(new Blob(["img"], { type: "image/bmp" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("不支持");
  });

  it("returns url on successful upload", async () => {
    setSession("user1", "USER");
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://cdn.example.com/uploads/2026/02/abc123.webp");
  });

  it("calls compressImage with correct params", async () => {
    setSession("user1", "USER");
    const blob = new Blob(["img"], { type: "image/png" });
    const req = makeUploadRequest(blob);
    await POST(req, { params: {} });
    expect(mockCompressImage).toHaveBeenCalledTimes(1);
  });

  it("uses gif extension for gif files", async () => {
    setSession("user1", "USER");
    mockCompressImage.mockResolvedValue({
      data: Buffer.from("gif-data"),
      contentType: "image/gif",
    });
    const req = makeUploadRequest(new Blob(["gif"], { type: "image/gif" }));
    await POST(req, { params: {} });
    expect(mockGenerateObjectKey).toHaveBeenCalledWith("gif");
  });

  it("uses webp extension for non-gif files", async () => {
    setSession("user1", "USER");
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    await POST(req, { params: {} });
    expect(mockGenerateObjectKey).toHaveBeenCalledWith("webp");
  });

  it("returns 500 when uploadToOSS throws", async () => {
    setSession("user1", "USER");
    mockUploadToOSS.mockRejectedValue(new Error("network error"));
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("上传失败");
  });

  it("returns 500 when compressImage throws", async () => {
    setSession("user1", "USER");
    mockCompressImage.mockRejectedValue(new Error("sharp error"));
    const req = makeUploadRequest(new Blob(["img"], { type: "image/jpeg" }));
    const res = await POST(req, { params: {} });
    expect(res.status).toBe(500);
  });
});
