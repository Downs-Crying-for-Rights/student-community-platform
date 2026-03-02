import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

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
import {
  generateCode,
  sendVerificationCode,
  verifyCode,
} from "../verification";

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

const mockGetSmsProvider = getSmsProvider as ReturnType<typeof vi.fn>;

// ==================== Generators ====================

/** Generate valid Chinese phone numbers: 1[3-9] followed by 9 digits */
const arbPhone = fc
  .tuple(
    fc.integer({ min: 3, max: 9 }),
    fc.stringMatching(/^\d{9}$/)
  )
  .map(([second, rest]) => `1${second}${rest}`);

/** Generate valid 6-digit code strings */
const arbSixDigitCode = fc.stringMatching(/^\d{6}$/);

/** Generate a purpose string */
const arbPurpose = fc.constantFrom("login", "bindphone");

// ==================== Property 4: 验证码格式 ====================
// Feature: multi-auth-login, Property 4: 验证码格式
// **Validates: Requirements 2.2, 6.7**

describe("属性 4: 验证码格式", () => {
  it("generateCode() 结果应为恰好 6 位的纯数字字符串", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const code = await generateCode();
        expect(code).toMatch(/^\d{6}$/);
        expect(code).toHaveLength(6);
      }),
      { numRuns: 100 },
    );
  });
});


// ==================== Property 5: 验证码存储与验证 Round-Trip ====================
// Feature: multi-auth-login, Property 5: 验证码存储与验证 Round-Trip
// **Validates: Requirements 2.4, 2.7**

describe("属性 5: 验证码存储与验证 Round-Trip", () => {
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
    delete process.env.SMS_TEST_MODE;
  });

  it("存储后用正确码验证应返回 true", async () => {
    await fc.assert(
      fc.asyncProperty(arbPhone, arbPurpose, async (phone, purpose) => {
        vi.clearAllMocks();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue("OK");
        mockRedis.del.mockResolvedValue(1);
        mockSendCode.mockResolvedValue(true);
        mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });

        // Capture the code stored in Redis during sendVerificationCode
        let storedCode: string | null = null;
        mockRedis.set.mockImplementation(
          async (key: string, value: string) => {
            if (key === `sms:${purpose}:${phone}`) {
              storedCode = value;
            }
            return "OK";
          }
        );

        const sendResult = await sendVerificationCode(phone, purpose);
        expect(sendResult.success).toBe(true);
        expect(storedCode).not.toBeNull();

        // Now simulate Redis returning the stored code for verification
        mockRedis.get.mockResolvedValue(storedCode);

        const verified = await verifyCode(phone, storedCode!, purpose);
        expect(verified).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 6: 错误验证码拒绝 ====================
// Feature: multi-auth-login, Property 6: 错误验证码拒绝
// **Validates: Requirements 2.5**

describe("属性 6: 错误验证码拒绝", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("用不同码验证应返回 false", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPhone,
        arbSixDigitCode,
        arbSixDigitCode,
        arbPurpose,
        async (phone, storedCode, wrongCode, purpose) => {
          // Only test when codes are actually different
          fc.pre(storedCode !== wrongCode);

          mockRedis.get.mockResolvedValue(storedCode);

          const result = await verifyCode(phone, wrongCode, purpose);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 },
    );
  });
});


// ==================== Property 7: 测试模式固定验证码 ====================
// Feature: multi-auth-login, Property 7: 测试模式固定验证码
// **Validates: Requirements 2.8**

describe("属性 7: 测试模式固定验证码", () => {
  const originalEnv = process.env.SMS_TEST_MODE;
  const mockSendCode = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockSendCode.mockResolvedValue(true);
    mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });
    process.env.SMS_TEST_MODE = "true";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMS_TEST_MODE;
    } else {
      process.env.SMS_TEST_MODE = originalEnv;
    }
  });

  it("SMS_TEST_MODE=true 时存储的验证码应固定为 888888", async () => {
    await fc.assert(
      fc.asyncProperty(arbPhone, arbPurpose, async (phone, purpose) => {
        vi.clearAllMocks();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue("OK");
        mockSendCode.mockResolvedValue(true);
        mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });

        // Capture the code stored in Redis
        let storedCode: string | null = null;
        mockRedis.set.mockImplementation(
          async (key: string, value: string) => {
            if (key === `sms:${purpose}:${phone}`) {
              storedCode = value;
            }
            return "OK";
          }
        );

        const result = await sendVerificationCode(phone, purpose);
        expect(result.success).toBe(true);
        expect(storedCode).toBe("888888");
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 9: 验证码发送频率限制 ====================
// Feature: multi-auth-login, Property 9: 验证码发送频率限制
// **Validates: Requirements 6.5**

describe("属性 9: 验证码发送频率限制", () => {
  const originalEnv = process.env.SMS_TEST_MODE;
  const mockSendCode = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(1);
    mockSendCode.mockResolvedValue(true);
    mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });
    delete process.env.SMS_TEST_MODE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMS_TEST_MODE;
    } else {
      process.env.SMS_TEST_MODE = originalEnv;
    }
  });

  it("60 秒内第一次调用应成功，第二次调用应返回频率限制错误", async () => {
    await fc.assert(
      fc.asyncProperty(arbPhone, arbPurpose, async (phone, purpose) => {
        vi.clearAllMocks();
        mockRedis.set.mockResolvedValue("OK");
        mockRedis.del.mockResolvedValue(1);
        mockSendCode.mockResolvedValue(true);
        mockGetSmsProvider.mockReturnValue({ sendCode: mockSendCode });

        // First call: no rate limit exists
        mockRedis.get.mockResolvedValue(null);
        const first = await sendVerificationCode(phone, purpose);
        expect(first.success).toBe(true);

        // Second call: rate limit key now exists (simulating Redis state)
        mockRedis.get.mockResolvedValue("1");
        const second = await sendVerificationCode(phone, purpose);
        expect(second.success).toBe(false);
        expect(second.error).toBe("请求过于频繁，请稍后再试");
      }),
      { numRuns: 100 },
    );
  });
});
