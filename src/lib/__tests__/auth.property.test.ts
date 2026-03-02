import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { loginPasswordSchema } from "../validators";
import bcrypt from "bcryptjs";

// Mock dependencies needed for Property 3 (authorize function tests)
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms/verification", () => ({
  verifyCode: vi.fn(),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

vi.mock("next-auth/providers/email", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: "email",
    type: "email",
    ...config,
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config: Record<string, unknown>) => ({
    id: config.id ?? "credentials",
    type: "credentials",
    ...config,
  })),
}));

import { prisma } from "../prisma";
import { verifyCode } from "../sms/verification";

// ==================== Generators ====================

/**
 * Generate strings that are NOT valid emails.
 * Strategy: generate arbitrary strings and filter out anything that
 * happens to be a valid email (extremely unlikely but safe).
 */
const arbInvalidEmail = fc.oneof(
  // Empty string
  fc.constant(""),
  // Missing @ symbol — alphanumeric strings without @
  fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/@/g, "")),
  // Missing domain part (ends with @)
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/@/g, "") + "@"),
  // Missing local part (starts with @)
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => "@" + s.replace(/@/g, "")),
  // Multiple @ symbols
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.string({ minLength: 1, maxLength: 10 }),
    )
    .map(([a, b, c]) => `${a}@${b}@${c}`),
  // Whitespace-only strings
  fc.integer({ min: 1, max: 10 }).map((n) => " ".repeat(n)),
);

/** Generate empty password strings (empty or whitespace that zod min(1) rejects) */
const arbEmptyPassword = fc.constant("");

// ==================== Property 2: 无效登录输入拒绝 ====================
// Feature: multi-auth-login, Property 2: 无效登录输入拒绝
// **Validates: Requirements 1.3**

describe("属性 2: 无效登录输入拒绝", () => {
  it("无效邮箱格式应被 loginPasswordSchema 拒绝", () => {
    fc.assert(
      fc.property(
        arbInvalidEmail,
        fc.string({ minLength: 1, maxLength: 72 }),
        (invalidEmail, password) => {
          const result = loginPasswordSchema.safeParse({
            email: invalidEmail,
            password,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("空密码应被 loginPasswordSchema 拒绝", () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        arbEmptyPassword,
        (validEmail, emptyPassword) => {
          const result = loginPasswordSchema.safeParse({
            email: validEmail,
            password: emptyPassword,
          });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("无效邮箱且空密码应被 loginPasswordSchema 拒绝", () => {
    fc.assert(
      fc.property(arbInvalidEmail, arbEmptyPassword, (invalidEmail, emptyPassword) => {
        const result = loginPasswordSchema.safeParse({
          email: invalidEmail,
          password: emptyPassword,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ==================== Property 1: 密码哈希 Round-Trip ====================
// Feature: multi-auth-login, Property 1: 密码哈希 Round-Trip
// **Validates: Requirements 1.2, 1.5**

/** Generate valid password strings (8-72 characters) */
const arbValidPassword = fc.string({ minLength: 8, maxLength: 72 }).filter((s) => s.length >= 8);

describe("属性 1: 密码哈希 Round-Trip", () => {
  it("bcrypt 哈希后 compare 应返回 true", () => {
    fc.assert(
      fc.property(arbValidPassword, (password) => {
        const hash = bcrypt.hashSync(password, 10);
        const isMatch = bcrypt.compareSync(password, hash);
        expect(isMatch).toBe(true);
      }),
      { numRuns: 25 },
    );
  }, 30_000);

  it("哈希结果应匹配 bcrypt 格式（$2a/$2b 开头，cost ≥ 10）", () => {
    fc.assert(
      fc.property(arbValidPassword, (password) => {
        const hash = bcrypt.hashSync(password, 10);
        // bcryptjs may produce $2a$ prefix
        expect(hash).toMatch(/^\$2[ab]\$/);
        // Extract cost factor from hash (format: $2a$XX$ or $2b$XX$)
        const costStr = hash.split("$")[2];
        const cost = parseInt(costStr, 10);
        expect(cost).toBeGreaterThanOrEqual(10);
      }),
      { numRuns: 25 },
    );
  });
});

// ==================== Property 3: 统一错误提示不泄露信息 ====================
// Feature: multi-auth-login, Property 3: 统一错误提示不泄露信息
// **Validates: Requirements 1.2, 1.4, 1.5**

/**
 * Extract the authorize function from the credentials-password provider.
 * We import authOptions and find the provider by id.
 */
async function getPasswordAuthorize() {
  const { authOptions } = await import("../auth");
  const provider = authOptions.providers.find(
    (p: any) => p.id === "credentials-password",
  ) as any;
  return provider.authorize as (
    credentials: { email: string; password: string } | undefined,
  ) => Promise<any>;
}

describe("属性 3: 统一错误提示不泄露信息", () => {
  const EXPECTED_ERROR = "邮箱或密码错误";
  // Pre-compute a bcrypt hash once to avoid slow hashing in every iteration
  const precomputedHash = bcrypt.hashSync("known-correct-password", 10);

  it("不存在的邮箱应返回统一错误消息", async () => {
    const authorize = await getPasswordAuthorize();

    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), fc.string({ minLength: 8, maxLength: 72 }), async (email, password) => {
        // Mock: user not found
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        try {
          await authorize({ email, password });
          expect.fail("authorize should have thrown");
        } catch (err: any) {
          expect(err.message).toBe(EXPECTED_ERROR);
        }
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it("错误密码应返回与不存在邮箱相同的错误消息", async () => {
    const authorize = await getPasswordAuthorize();

    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        // Mock: user exists but password won't match (we use a random wrong password)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: "user-1",
          email,
          nickname: "Test",
          role: "USER",
          phone: null,
          passwordHash: precomputedHash,
        } as any);

        try {
          // Use a password that definitely doesn't match the precomputed hash
          await authorize({ email, password: "wrong-password-xyz" });
          expect.fail("authorize should have thrown");
        } catch (err: any) {
          expect(err.message).toBe(EXPECTED_ERROR);
        }
      }),
      { numRuns: 100 },
    );
  }, 60000);

  it("不存在邮箱和错误密码返回完全相同的错误消息", async () => {
    const authorize = await getPasswordAuthorize();

    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        async (email) => {
          // Case 1: non-existent email
          vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
          let errorNonExistent: string | undefined;
          try {
            await authorize({ email, password: "some-password-123" });
          } catch (err: any) {
            errorNonExistent = err.message;
          }

          // Case 2: wrong password (user exists but password doesn't match)
          vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: "user-1",
            email,
            nickname: "Test",
            role: "USER",
            phone: null,
            passwordHash: precomputedHash,
          } as any);
          let errorWrongPassword: string | undefined;
          try {
            await authorize({ email, password: "wrong-password-xyz" });
          } catch (err: any) {
            errorWrongPassword = err.message;
          }

          // Both errors should be identical
          expect(errorNonExistent).toBe(EXPECTED_ERROR);
          expect(errorWrongPassword).toBe(EXPECTED_ERROR);
          expect(errorNonExistent).toBe(errorWrongPassword);
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});


// ==================== Property 11: 手机号登录隐含已绑定 ====================
// Feature: multi-auth-login, Property 11: 手机号登录隐含已绑定
// **Validates: Requirements 5.8**

/** Generate valid Chinese phone numbers: 1[3-9] followed by 9 digits */
const arbChinesePhone = fc
  .tuple(
    fc.integer({ min: 3, max: 9 }),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 }),
  )
  .map(([second, rest]) => `1${second}${rest.join("")}`);

/**
 * Extract the authorize function from the credentials-sms provider.
 */
async function getSmsAuthorize() {
  const { authOptions } = await import("../auth");
  const provider = authOptions.providers.find(
    (p: any) => p.id === "credentials-sms",
  ) as any;
  return provider.authorize as (
    credentials: { phone: string; code: string } | undefined,
  ) => Promise<any>;
}

describe("属性 11: 手机号登录隐含已绑定", () => {
  it("手机号登录返回的用户 phone 字段等于登录手机号", async () => {
    const authorize = await getSmsAuthorize();

    await fc.assert(
      fc.asyncProperty(arbChinesePhone, async (phone) => {
        // Mock verifyCode to return true
        vi.mocked(verifyCode).mockResolvedValue(true);

        // Mock prisma.user.findFirst to return an existing user with this phone
        vi.mocked(prisma.user.findFirst).mockResolvedValue({
          id: "user-sms-1",
          email: null,
          nickname: "TestUser",
          role: "USER",
          phone,
        } as any);

        const user = await authorize({ phone, code: "888888" });

        // The returned user's phone field must equal the login phone
        expect(user).not.toBeNull();
        expect(user.phone).toBe(phone);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it("新用户手机号登录自动创建后 phone 字段等于登录手机号", async () => {
    const authorize = await getSmsAuthorize();

    await fc.assert(
      fc.asyncProperty(arbChinesePhone, async (phone) => {
        vi.mocked(verifyCode).mockResolvedValue(true);

        // User does not exist yet
        vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

        // Mock create to return a new user with the phone
        vi.mocked(prisma.user.create).mockResolvedValue({
          id: "new-user-1",
          email: null,
          nickname: null,
          role: "USER",
          phone,
        } as any);

        const user = await authorize({ phone, code: "888888" });

        expect(user).not.toBeNull();
        expect(user.phone).toBe(phone);
      }),
      { numRuns: 100 },
    );
  }, 30000);

  it("手机号登录后 JWT token 中 phone 字段等于登录手机号", async () => {
    const authorize = await getSmsAuthorize();
    const { authOptions } = await import("../auth");
    const jwtCallback = authOptions.callbacks!.jwt!;

    await fc.assert(
      fc.asyncProperty(arbChinesePhone, async (phone) => {
        vi.mocked(verifyCode).mockResolvedValue(true);

        vi.mocked(prisma.user.findFirst).mockResolvedValue({
          id: "user-jwt-1",
          email: null,
          nickname: "TestUser",
          role: "USER",
          phone,
        } as any);

        // Step 1: authorize returns user with phone
        const user = await authorize({ phone, code: "888888" });

        // Step 2: Mock prisma.user.findUnique for the jwt callback lookup
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          role: "USER",
          phone,
        } as any);

        // Step 3: Pass user through jwt callback (simulates first sign-in)
        const token = await jwtCallback({
          token: {} as any,
          user,
          account: null,
          profile: undefined,
          trigger: "signIn",
          isNewUser: false,
          session: undefined,
        } as any);

        // The JWT token's phone field must equal the login phone
        expect(token.phone).toBe(phone);
      }),
      { numRuns: 100 },
    );
  }, 30000);
});
