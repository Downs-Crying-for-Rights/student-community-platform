import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * OSS 工具函数测试
 *
 * 测试 oss.ts 中的纯函数逻辑：
 * - generateObjectKey: 生成唯一对象键
 * - validateFile: 文件类型和大小校验
 * - compressImage: 图片压缩（mock sharp）
 * - uploadToOSS: 上传到 OSS（mock S3Client）
 */

// ==================== Mocks ====================

const { mockSend, mockSharpInstance } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockSharpInstance = {
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("compressed")),
  };
  return { mockSend, mockSharpInstance };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send = mockSend; },
  PutObjectCommand: class { constructor(params: unknown) { Object.assign(this, params); } },
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => mockSharpInstance),
}));

// ==================== Import after mocks ====================

import {
  generateObjectKey,
  validateFile,
  compressImage,
  uploadToOSS,
  MAX_RAW_SIZE,
  ALLOWED_TYPES,
} from "../oss";

beforeEach(() => {
  vi.clearAllMocks();
  mockSharpInstance.resize.mockReturnThis();
  mockSharpInstance.webp.mockReturnThis();
  mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from("compressed"));
});

// ==================== generateObjectKey ====================

describe("generateObjectKey", () => {
  it("generates key with default webp extension", () => {
    const key = generateObjectKey();
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.webp$/);
  });

  it("generates key with custom extension", () => {
    const key = generateObjectKey("gif");
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.gif$/);
  });

  it("generates unique keys on each call", () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateObjectKey()));
    expect(keys.size).toBe(20);
  });

  it("uses current year and month in path", () => {
    const key = generateObjectKey();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    expect(key).toContain(`uploads/${yyyy}/${mm}/`);
  });
});

// ==================== validateFile ====================

describe("validateFile", () => {
  it("returns null for valid jpeg", () => {
    expect(validateFile(1024, "image/jpeg")).toBeNull();
  });

  it("returns null for valid png", () => {
    expect(validateFile(1024, "image/png")).toBeNull();
  });

  it("returns null for valid webp", () => {
    expect(validateFile(1024, "image/webp")).toBeNull();
  });

  it("returns null for valid gif", () => {
    expect(validateFile(1024, "image/gif")).toBeNull();
  });

  it("returns error for unsupported type", () => {
    const err = validateFile(1024, "image/bmp");
    expect(err).toBeTruthy();
    expect(err).toContain("不支持");
  });

  it("returns error for non-image type", () => {
    expect(validateFile(1024, "application/pdf")).toBeTruthy();
  });

  it("returns null for file at exactly MAX_RAW_SIZE", () => {
    expect(validateFile(MAX_RAW_SIZE, "image/jpeg")).toBeNull();
  });

  it("returns error for file exceeding MAX_RAW_SIZE", () => {
    const err = validateFile(MAX_RAW_SIZE + 1, "image/jpeg");
    expect(err).toBeTruthy();
    expect(err).toContain("MB");
  });

  it("ALLOWED_TYPES contains exactly 4 types", () => {
    expect(ALLOWED_TYPES).toHaveLength(4);
    expect(ALLOWED_TYPES).toContain("image/jpeg");
    expect(ALLOWED_TYPES).toContain("image/png");
    expect(ALLOWED_TYPES).toContain("image/webp");
    expect(ALLOWED_TYPES).toContain("image/gif");
  });
});

// ==================== compressImage ====================

describe("compressImage", () => {
  it("passes GIF through without compression", async () => {
    const buf = Buffer.from("fake-gif");
    const result = await compressImage(buf, "image/gif");
    expect(result.data).toBe(buf);
    expect(result.contentType).toBe("image/gif");
  });

  it("compresses JPEG to WebP", async () => {
    const buf = Buffer.from("fake-jpeg");
    const result = await compressImage(buf, "image/jpeg");
    expect(result.contentType).toBe("image/webp");
    expect(mockSharpInstance.resize).toHaveBeenCalledWith({
      width: 1920,
      withoutEnlargement: true,
    });
    expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
  });

  it("compresses PNG to WebP", async () => {
    const result = await compressImage(Buffer.from("fake-png"), "image/png");
    expect(result.contentType).toBe("image/webp");
  });

  it("compresses WebP input (re-encodes)", async () => {
    const result = await compressImage(Buffer.from("fake-webp"), "image/webp");
    expect(result.contentType).toBe("image/webp");
    expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
  });
});

// ==================== uploadToOSS ====================

describe("uploadToOSS", () => {
  it("sends PutObjectCommand and returns CDN URL", async () => {
    mockSend.mockResolvedValue({});
    const url = await uploadToOSS(
      Buffer.from("data"),
      "uploads/2026/02/abc.webp",
      "image/webp",
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(url).toContain("uploads/2026/02/abc.webp");
  });

  it("sets correct ContentType and CacheControl", async () => {
    mockSend.mockResolvedValue({});
    await uploadToOSS(Buffer.from("data"), "key.webp", "image/webp");

    const command = mockSend.mock.calls[0][0];
    expect(command.ContentType).toBe("image/webp");
    expect(command.CacheControl).toContain("immutable");
  });

  it("propagates S3 errors", async () => {
    mockSend.mockRejectedValue(new Error("S3 failure"));
    await expect(
      uploadToOSS(Buffer.from("data"), "key.webp", "image/webp"),
    ).rejects.toThrow("S3 failure");
  });
});
