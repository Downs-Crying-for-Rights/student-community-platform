import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { TestSmsProvider } from "../test-provider";
import { ProductionSmsProvider } from "../production-provider";

describe("TestSmsProvider", () => {
  it("should log the code and return true", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = new TestSmsProvider();
    const result = await provider.sendCode("13800138000", "123456");

    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith("[TEST SMS] 13800138000: 123456");
    consoleSpy.mockRestore();
  });
});

describe("ProductionSmsProvider", () => {
  it("should throw not configured error", async () => {
    const provider = new ProductionSmsProvider();
    await expect(provider.sendCode("13800138000", "123456")).rejects.toThrow(
      "Production SMS provider not configured"
    );
  });
});

describe("getSmsProvider", () => {
  const originalEnv = process.env.SMS_TEST_MODE;

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
