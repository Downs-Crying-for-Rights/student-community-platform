import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAccountFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockGetUserByCode = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
    user: {
      create: (...args: unknown[]) => mockUserCreate(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/oauth-aggregator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oauth-aggregator")>();
  return {
    ...actual,
    getUserByCode: (...args: unknown[]) => mockGetUserByCode(...args),
  };
});

import { GET } from "../callback/route";
import { decode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

const TEST_SECRET = "test-secret-for-oauth-unit";
process.env.NEXTAUTH_SECRET = TEST_SECRET;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "oauth-user-1",
    role: "USER",
    phone: null,
    nickname: "QQ小明",
    avatar: "https://img/avatar.png",
    onboardingDone: false,
    quizPassed: false,
    dcrAccess: false,
    isBanned: false,
    banUntil: null,
    isMuted: false,
    muteUntil: null,
    securityVersion: 0,
    profileCompletionRequired: false,
    realVerifiedAt: null,
    studentVerifiedAt: null,
    deactivatedAt: null,
    email: null,
    emailVerified: null,
    username: null,
    image: null,
    name: null,
    bio: null,
    qqNumber: null,
    isShadowBanned: false,
    isAnonymous: false,
    violationCount: 0,
    psychAccess: false,
    dcrContributionAccess: false,
    dcrHelperAccess: false,
    passwordHash: null,
    ...overrides,
  };
}

const CALLBACK_URL = "http://localhost:3000/api/auth/oauth/callback?type=qq&code=xyz";

describe("OAuth callback 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("缺少 type 或 code 时应重定向到登录页（带错误）", async () => {
    const res = await GET(new Request("http://localhost:3000/api/auth/oauth/callback?type=qq"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("不支持的 type 应重定向到登录页", async () => {
    const res = await GET(new Request("http://localhost:3000/api/auth/oauth/callback?type=unknown&code=xyz"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("聚合平台返回错误时应重定向到登录页", async () => {
    mockGetUserByCode.mockRejectedValue(new Error("code 无效"));
    const res = await GET(new Request(CALLBACK_URL));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    // searchParams.get 自动解码一次，得到原始错误信息
    expect(location.searchParams.get("error")).toContain("code 无效");
  });

  it("新用户应创建账号并在响应上签发含完整声明的 session cookie", async () => {
    mockGetUserByCode.mockResolvedValue({
      code: 0,
      msg: "ok",
      type: "qq",
      social_uid: "U12345",
      access_token: "tok",
      faceimg: "https://img/avatar.png",
      nickname: "QQ小明",
    });
    mockAccountFindUnique.mockResolvedValue(null); // 尚未关联
    mockUserCreate.mockResolvedValue(makeUser());

    const res = await GET(new Request(CALLBACK_URL));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");

    // cookie 必须设置在重定向响应对象上，否则登录无效
    const cookie = res.cookies.get("next-auth.session-token");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);

    const decoded = await decode({ token: cookie!.value, secret: TEST_SECRET });
    // 关键字段必须存在，否则会被 jwt 回调判失效或被 middleware 死循环重定向
    expect(decoded?.sub).toBe("oauth-user-1");
    expect(decoded?.securityVersion).toBe(0);
    expect(decoded?.nickname).toBe("QQ小明");
    expect(decoded?.onboardingDone).toBe(false);
    expect(decoded?.quizPassed).toBe(false);
    expect(decoded?.role).toBe("USER");
  });

  it("已存在账号应直接复用，不重复创建用户", async () => {
    mockGetUserByCode.mockResolvedValue({
      code: 0,
      msg: "ok",
      type: "qq",
      social_uid: "U12345",
      access_token: "tok",
      faceimg: null,
      nickname: "QQ小明",
    });
    mockAccountFindUnique.mockResolvedValue({ userId: "oauth-user-1", user: makeUser() });

    const res = await GET(new Request(CALLBACK_URL));

    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    const cookie = res.cookies.get("next-auth.session-token");
    const decoded = await decode({ token: cookie!.value, secret: TEST_SECRET });
    expect(decoded?.sub).toBe("oauth-user-1");
  });

  it("签发的 token 经过 jwt 回调刷新后不会被判定失效", async () => {
    mockGetUserByCode.mockResolvedValue({
      code: 0,
      msg: "ok",
      type: "qq",
      social_uid: "U12345",
      access_token: "tok",
      faceimg: "https://img/avatar.png",
      nickname: "QQ小明",
    });
    mockAccountFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue(makeUser());

    const res = await GET(new Request(CALLBACK_URL));
    const cookie = res.cookies.get("next-auth.session-token");
    const decoded = await decode({ token: cookie!.value, secret: TEST_SECRET });

    // 模拟 getServerSession 触发 jwt 回调刷新路径
    mockUserFindUnique.mockResolvedValue(makeUser());
    const refreshed = (await (authOptions.callbacks!.jwt as any)({
      token: decoded,
      user: undefined,
      account: null,
      trigger: "update",
    })) as Record<string, unknown>;

    expect(refreshed.sub).toBe("oauth-user-1");
    expect(refreshed.isBanned).toBe(false);
    expect(refreshed.id).toBe("oauth-user-1");
  });

  it("回归：缺少 securityVersion 的旧 token 会被 jwt 回调判失效（证明修复前的症状）", async () => {
    mockUserFindUnique.mockResolvedValue(makeUser());

    const brokenToken = { sub: "oauth-user-1", id: "oauth-user-1", name: "QQ小明" };
    const refreshed = (await (authOptions.callbacks!.jwt as any)({
      token: brokenToken,
      user: undefined,
      account: null,
      trigger: "update",
    })) as Record<string, unknown>;

    // 修复前：session 会被清空、标记为已封禁，导致登录后立即失效
    expect(refreshed.sub).toBeUndefined();
    expect(refreshed.isBanned).toBe(true);
  });
});
