import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

// Mock verifyCode
const mockVerifyCode = vi.fn();
vi.mock("@/lib/sms/verification", () => ({
  verifyCode: (...args: unknown[]) => mockVerifyCode(...args),
}));

// Mock Prisma
const mockInviteCodeFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    inviteCode: {
      findUnique: (...args: unknown[]) => mockInviteCodeFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { POST } from "../route";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/invite", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// --- Arbitraries for valid fields ---
// inviteCode: 6-32 alphanumeric chars (avoid whitespace-only strings)
const validInviteCode = fc.stringMatching(/^[A-Za-z0-9]{6,32}$/);
// email: generate emails that pass Zod's .email() validation
const validEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z]{2,6}$/),
    fc.constantFrom("com", "org", "net", "io")
  )
  .map(([user, domain, tld]) => `${user}@${domain}.${tld}`);
// password: 8-72 printable chars (avoid control chars)
const validPassword = fc.stringMatching(/^[A-Za-z0-9!@#$%^&*]{8,32}$/);
// phone: matches /^1\d{10}$/
const validPhone = fc
  .tuple(
    fc.integer({ min: 3, max: 9 }),
    fc.stringMatching(/^\d{9}$/)
  )
  .map(([second, rest]) => `1${second}${rest}`);
// code: matches /^\d{6}$/
const validSmsCode = fc.stringMatching(/^\d{6}$/);

const validBodyArb = fc.record({
  inviteCode: validInviteCode,
  email: validEmail,
  password: validPassword,
  phone: validPhone,
  code: validSmsCode,
});

const requiredFields = [
  "inviteCode",
  "email",
  "password",
  "phone",
  "code",
] as const;

describe("邀请码注册属性测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockVerifyCode.mockResolvedValue(true);
  });

  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   * Property: any request body missing a required field returns 400
   */
  it("属性：缺少任一必填字段的请求体返回 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        validBodyArb,
        fc.constantFrom(...requiredFields),
        async (body, fieldToRemove) => {
          const incomplete = { ...body };
          delete (incomplete as Record<string, unknown>)[fieldToRemove];

          const req = createRequest(incomplete);
          const res = await POST(req);
          expect(res.status).toBe(400);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * Property: valid invite code + complete identity → user created with dcrAccess=true and isAnonymous=false
   */
  it("属性：有效邀请码 + 完整身份信息 → 用户 dcrAccess=true 且 isAnonymous=false", async () => {
    await fc.assert(
      fc.asyncProperty(validBodyArb, async (body) => {
        // Reset mocks for each property run
        vi.clearAllMocks();
        mockUserFindUnique.mockResolvedValue(null);
        mockUserFindFirst.mockResolvedValue(null);
        mockVerifyCode.mockResolvedValue(true);

        mockInviteCodeFindUnique.mockResolvedValue({
          id: "invite1",
          code: body.inviteCode,
          isUsed: false,
          isRevoked: false,
          expiresAt: new Date(Date.now() + 86400000),
        });

        let capturedUserData: Record<string, unknown> | null = null;
        mockTransaction.mockImplementation(async (fn: Function) => {
          const tx = {
            user: {
              create: vi
                .fn()
                .mockImplementation(
                  (args: { data: Record<string, unknown> }) => {
                    capturedUserData = args.data;
                    return { id: "user1" };
                  }
                ),
            },
            inviteCode: { update: vi.fn().mockResolvedValue({}) },
            session: { create: vi.fn().mockResolvedValue({}) },
          };
          return fn(tx);
        });

        const req = createRequest(body);
        const res = await POST(req);

        expect(res.status).toBe(201);
        expect(capturedUserData).not.toBeNull();
        expect(capturedUserData!.dcrAccess).toBe(true);
        expect(capturedUserData!.isAnonymous).toBe(false);
      }),
      { numRuns: 30 }
    );
  });
});
