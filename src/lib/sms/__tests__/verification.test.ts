import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock factories are hoisted — use inline objects
vi.mock("@/lib/redis", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/sms", () => ({
  getSmsProvider: vi.fn(() => ({
    sendCode: vi.fn().mockResolvedValue(true),
  })),
}));

import redis from "@/lib/redis";
import { getSmsProvider } from "@/lib/sms";
import { generateCode, sendVerificationCode, verifyCode } from "../verification";

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

const mockGetSmsProvider = getSmsProvider as ReturnType<typeof vi.fn>;

describe("generateCode", () => {
  it("should return a 6-digit string", async () => {
    const code = await generateCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("should always return exactly 6 characters", async () => {
    // Run multiple times to increase confidence in padding behavior
    for (let i = 0; i < 20; i++) {
      const code = await generateCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("sendVerificationCode", () => {
  const originalEnv = process.env.SMS_TEST_MODE;
  const mockSendCode = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(1);
    mockSendCode.mockResolvedValue(true);
    mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMS_TEST_MODE;
    } else {
      process.env.SMS_TEST_MODE = originalEnv;
    }
  });

  it("should send verification code successfully", async () => {
    const result = await sendVerificationCode("13800138000", "login");

    expect(result).toEqual({ success: true });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "sms:login:13800138000",
      expect.stringMatching(/^\d{6}$/),
      "EX",
      300
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      "sms:limit:13800138000",
      "1",
      "EX",
      60
    );
    expect(mockSendCode).toHaveBeenCalled();
  });

  it("should return rate limit error when called within 60 seconds", async () => {
    mockRedis.get.mockResolvedValue("1");

    const result = await sendVerificationCode("13800138000", "login");

    expect(result).toEqual({
      success: false,
      error: "请求过于频繁，请稍后再试",
    });
    expect(mockSendCode).not.toHaveBeenCalled();
  });

  it("should use fixed code 888888 in test mode", async () => {
    process.env.SMS_TEST_MODE = "true";

    const result = await sendVerificationCode("13800138000", "login");

    expect(result).toEqual({ success: true });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "sms:login:13800138000",
      "888888",
      "EX",
      300
    );
  });

  it("should use purpose in Redis key", async () => {
    const result = await sendVerificationCode("13800138000", "bindphone");

    expect(result).toEqual({ success: true });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "sms:bindphone:13800138000",
      expect.stringMatching(/^\d{6}$/),
      "EX",
      300
    );
  });

  it("should clean up on send failure", async () => {
    mockSendCode.mockResolvedValue(false);

    const result = await sendVerificationCode("13800138000", "login");

    expect(result).toEqual({
      success: false,
      error: "验证码发送失败，请稍后再试",
    });
    expect(mockRedis.del).toHaveBeenCalledWith("sms:login:13800138000");
    expect(mockRedis.del).toHaveBeenCalledWith("sms:limit:13800138000");
  });
});

describe("verifyCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for correct code and delete it", async () => {
    mockRedis.get.mockResolvedValue("123456");
    mockRedis.del.mockResolvedValue(1);

    const result = await verifyCode("13800138000", "123456", "login");

    expect(result).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith("sms:login:13800138000");
  });

  it("should return false for incorrect code", async () => {
    mockRedis.get.mockResolvedValue("123456");

    const result = await verifyCode("13800138000", "654321", "login");

    expect(result).toBe(false);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("should return false when no code is stored (expired)", async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await verifyCode("13800138000", "123456", "login");

    expect(result).toBe(false);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it("should use purpose in Redis key", async () => {
    mockRedis.get.mockResolvedValue("123456");
    mockRedis.del.mockResolvedValue(1);

    await verifyCode("13800138000", "123456", "bindphone");

    expect(mockRedis.get).toHaveBeenCalledWith("sms:bindphone:13800138000");
    expect(mockRedis.del).toHaveBeenCalledWith("sms:bindphone:13800138000");
  });
});
