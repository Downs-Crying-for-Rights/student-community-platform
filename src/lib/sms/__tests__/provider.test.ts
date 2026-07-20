import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as fc from "fast-check";
import { TestSmsProvider } from "../test-provider";
import { loadAliyunSmsConfig, ProductionSmsProvider } from "../production-provider";

const aliyunConfig = {
  signName: "恒创联众",
  templateCodes: {
    register: "100001",
    "change-phone": "100002",
    "reset-password": "100003",
    bindphone: "100004",
    "verify-bound-phone": "100005",
  },
  endpoint: "dypnsapi.aliyuncs.com",
  connectTimeout: 5_000,
  readTimeout: 5_000,
};

function configureAliyunEnv() {
  process.env.ALIYUN_SMS_SIGN_NAME = aliyunConfig.signName;
  process.env.ALIYUN_SMS_TEMPLATE_LOGIN = "100001";
  process.env.ALIYUN_SMS_TEMPLATE_CHANGE_PHONE = "100002";
  process.env.ALIYUN_SMS_TEMPLATE_RESET_PASSWORD = "100003";
  process.env.ALIYUN_SMS_TEMPLATE_BIND_NEW_PHONE = "100004";
  process.env.ALIYUN_SMS_TEMPLATE_VERIFY_BOUND_PHONE = "100005";
}

describe("TestSmsProvider", () => {
  it("should log the code and return true", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = new TestSmsProvider();
    const result = await provider.sendCode("13800138000", "123456", "register");

    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith("[TEST SMS] 13800138000: 123456");
    consoleSpy.mockRestore();
  });
});

describe("ProductionSmsProvider", () => {
  beforeEach(() => configureAliyunEnv());

  it("submits an Aliyun SendSmsVerifyCode request without automatic retries", async () => {
    const sendSmsVerifyCodeWithOptions = vi.fn().mockResolvedValue({ body: { code: "OK", success: true, requestId: "request-1" } });
    const provider = new ProductionSmsProvider({ client: { sendSmsVerifyCodeWithOptions }, config: aliyunConfig });

    await expect(provider.sendCode("13800138000", "123456", "reset-password")).resolves.toBe(true);
    const [request, runtime] = sendSmsVerifyCodeWithOptions.mock.calls[0];
    expect(request).toMatchObject({
      phoneNumber: "13800138000",
      countryCode: "86",
      signName: "恒创联众",
      templateCode: "100003",
      templateParam: '{"code":"123456","min":"5"}',
      codeLength: 6,
      validTime: 300,
      duplicatePolicy: 1,
      interval: 60,
      returnVerifyCode: false,
      autoRetry: 0,
    });
    expect(runtime).toMatchObject({ autoretry: false, maxAttempts: 1, connectTimeout: 5_000, readTimeout: 5_000 });
  });

  it("returns false when Aliyun rejects the request", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendSmsVerifyCodeWithOptions = vi.fn().mockResolvedValue({
      body: { code: "isv.SMS_SIGNATURE_ILLEGAL", success: false, message: "invalid sign", requestId: "request-2" },
    });
    const provider = new ProductionSmsProvider({
      client: { sendSmsVerifyCodeWithOptions },
      config: aliyunConfig,
    });

    await expect(provider.sendCode("13800138000", "123456", "register")).resolves.toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("Aliyun SMS authentication rejected request", expect.objectContaining({
      code: "isv.SMS_SIGNATURE_ILLEGAL",
      requestId: "request-2",
    }));
    consoleSpy.mockRestore();
  });

  it("returns false without logging phone numbers or codes when the SDK throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new ProductionSmsProvider({
      client: { sendSmsVerifyCodeWithOptions: vi.fn().mockRejectedValue({ code: "TimeoutError", message: "request timed out" }) },
      config: aliyunConfig,
    });

    await expect(provider.sendCode("13800138000", "123456", "register")).resolves.toBe(false);
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("13800138000");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("123456");
    consoleSpy.mockRestore();
  });

  it("validates required environment configuration", () => {
    delete process.env.ALIYUN_SMS_SIGN_NAME;
    delete process.env.ALIYUN_SMS_TEMPLATE_LOGIN;
    expect(() => loadAliyunSmsConfig()).toThrow("ALIYUN_SMS_SIGN_NAME");
  });
});

describe("getSmsProvider", () => {
  const originalEnv = process.env.SMS_TEST_MODE;
  beforeEach(() => configureAliyunEnv());

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMS_TEST_MODE;
    } else {
      process.env.SMS_TEST_MODE = originalEnv;
    }
    vi.resetModules();
  });

  it("should return TestSmsProvider when SMS_TEST_MODE=true", async () => {
    process.env.SMS_TEST_MODE = "true";
    const { getSmsProvider } = await import("../index");
    const { TestSmsProvider: TSP } = await import("../test-provider");
    const provider = getSmsProvider();
    expect(provider).toBeInstanceOf(TSP);
  });

  it("should return ProductionSmsProvider when SMS_TEST_MODE is not set", async () => {
    delete process.env.SMS_TEST_MODE;
    const { getSmsProvider } = await import("../index");
    const { ProductionSmsProvider: PSP } = await import("../production-provider");
    const provider = getSmsProvider();
    expect(provider).toBeInstanceOf(PSP);
  });

  it("should return ProductionSmsProvider when SMS_TEST_MODE=false", async () => {
    process.env.SMS_TEST_MODE = "false";
    const { getSmsProvider } = await import("../index");
    const { ProductionSmsProvider: PSP } = await import("../production-provider");
    const provider = getSmsProvider();
    expect(provider).toBeInstanceOf(PSP);
  });
});


// ==================== Property 8: SMS Provider 环境选择 ====================
// Feature: multi-auth-login, Property 8: SMS Provider 环境选择
// **Validates: Requirements 6.3, 6.4**

describe("属性 8: SMS Provider 环境选择", () => {
  const originalEnv = process.env.SMS_TEST_MODE;
  beforeEach(() => configureAliyunEnv());

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SMS_TEST_MODE;
    } else {
      process.env.SMS_TEST_MODE = originalEnv;
    }
    vi.resetModules();
  });

  it("SMS_TEST_MODE=true 时 getSmsProvider() 应返回 TestSmsProvider 实例", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random env value strings to ensure only "true" triggers TestSmsProvider
        fc.constant("true"),
        async (_envValue) => {
          vi.resetModules();
          process.env.SMS_TEST_MODE = "true";
          const { getSmsProvider } = await import("../index");
          const { TestSmsProvider: TSP } = await import("../test-provider");
          const provider = getSmsProvider();
          expect(provider).toBeInstanceOf(TSP);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("SMS_TEST_MODE 未设置或非 true 时 getSmsProvider() 应返回 ProductionSmsProvider 实例", async () => {
    // Generate random non-"true" env values (including undefined, "false", random strings)
    const arbNonTrueEnvValue = fc.oneof(
      fc.constant(undefined as string | undefined),
      fc.constant("false"),
      fc.constant(""),
      fc.constant("FALSE"),
      fc.constant("True"),
      fc.constant("TRUE"),
      fc.constant("0"),
      fc.constant("1"),
      fc.string({ minLength: 0, maxLength: 20 }).filter((s) => s !== "true"),
    );

    await fc.assert(
      fc.asyncProperty(arbNonTrueEnvValue, async (envValue) => {
        vi.resetModules();
        if (envValue === undefined) {
          delete process.env.SMS_TEST_MODE;
        } else {
          process.env.SMS_TEST_MODE = envValue;
        }
        const { getSmsProvider } = await import("../index");
        const { ProductionSmsProvider: PSP } = await import(
          "../production-provider"
        );
        const provider = getSmsProvider();
        expect(provider).toBeInstanceOf(PSP);
      }),
      { numRuns: 100 },
    );
  });
});
