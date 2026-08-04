import { describe, it, expect, vi, beforeEach } from "vitest";
import { getConnectUrl, getUserByCode, queryUser, SUPPORTED_TYPES } from "@/lib/oauth-aggregator";

describe("oauth-aggregator 工具库", () => {
  beforeEach(() => {
    process.env.OAUTH_AGGREGATOR_APPID = "test-appid";
    process.env.OAUTH_AGGREGATOR_APPKEY = "test-appkey";
    vi.restoreAllMocks();
  });

  it("应支持 17 种第三方登录方式", () => {
    expect(SUPPORTED_TYPES).toHaveLength(17);
    expect(SUPPORTED_TYPES).toContain("qq");
    expect(SUPPORTED_TYPES).toContain("github");
  });

  it("getConnectUrl 应解析成功响应并返回跳转地址", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, msg: "ok", type: "qq", url: "https://third.party/authorize" }),
      }),
    );

    const data = await getConnectUrl("qq", "https://app/callback");
    expect(data.code).toBe(0);
    expect(data.url).toBe("https://third.party/authorize");
  });

  it("getConnectUrl 在 code !== 0 时应抛出聚合平台返回的错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 1, msg: "应用未授权" }),
      }),
    );

    await expect(getConnectUrl("qq", "https://app/callback")).rejects.toThrow("应用未授权");
  });

  it("getUserByCode 应解析用户信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          msg: "ok",
          type: "qq",
          social_uid: "U12345",
          access_token: "tok",
          faceimg: "https://img/a.png",
          nickname: "QQ小明",
        }),
      }),
    );

    const data = await getUserByCode("qq", "code-xyz");
    expect(data.social_uid).toBe("U12345");
    expect(data.nickname).toBe("QQ小明");
  });

  it("getUserByCode 在 code !== 0 时应抛出错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 100, msg: "code 无效" }),
      }),
    );

    await expect(getUserByCode("qq", "bad-code")).rejects.toThrow("code 无效");
  });

  it("fetch 返回非 2xx 时应抛出 HTTP 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getUserByCode("qq", "code-xyz")).rejects.toThrow(/HTTP 500/);
  });

  it("queryUser 应通过 social_uid 查询用户信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          msg: "ok",
          type: "qq",
          social_uid: "U12345",
          access_token: "tok",
          nickname: "QQ小明",
          faceimg: "https://img/a.png",
        }),
      }),
    );

    const data = await queryUser("qq", "U12345");
    expect(data.social_uid).toBe("U12345");
  });
});
