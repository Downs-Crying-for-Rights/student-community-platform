import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetConnectUrl = vi.fn();

vi.mock("@/lib/oauth-aggregator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oauth-aggregator")>();
  return {
    ...actual,
    getConnectUrl: (...args: unknown[]) => mockGetConnectUrl(...args),
  };
});

import { GET } from "../connect/route";

describe("OAuth connect 路由", () => {
  beforeEach(() => vi.clearAllMocks());

  it("缺少 type 参数应返回 400", async () => {
    const res = await GET(new Request("http://localhost:3000/api/auth/oauth/connect"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("type");
  });

  it("不支持的 type 应返回 400", async () => {
    const res = await GET(new Request("http://localhost:3000/api/auth/oauth/connect?type=unknown"));
    expect(res.status).toBe(400);
  });

  it("成功时应返回第三方跳转地址", async () => {
    mockGetConnectUrl.mockResolvedValue({
      code: 0,
      msg: "ok",
      type: "qq",
      url: "https://third.party/authorize?state=abc",
    });

    const res = await GET(
      new Request(
        "http://localhost:3000/api/auth/oauth/connect?type=qq&redirect_uri=http://localhost:3000/api/auth/oauth/callback",
      ),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toBe("https://third.party/authorize?state=abc");
  });

  it("聚合平台调用失败时应返回 502", async () => {
    mockGetConnectUrl.mockRejectedValue(new Error("聚合登录 connect 请求失败: HTTP 502"));

    const res = await GET(new Request("http://localhost:3000/api/auth/oauth/connect?type=qq"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("聚合登录");
  });
});
