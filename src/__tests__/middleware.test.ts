import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getToken = vi.hoisted(() => vi.fn());
vi.mock("next-auth/jwt", () => ({ getToken }));

import middleware, {
  config,
  PHONE_REQUIRED_PAGE_PATHS,
  isPhoneRequiredPageAllowed,
} from "../middleware";

const request = (path: string) => new NextRequest(`https://example.test${path}`);

describe("authentication middleware", () => {
  beforeEach(() => getToken.mockReset());

  it("matches every page while excluding APIs, internals, and static files", () => {
    expect(config.matcher).toEqual(["/((?!api(?:/|$)|_next(?:/|$)|.*\\..*).*)"]);
  });

  it("uses an exact phone-binding page exception", () => {
    expect(PHONE_REQUIRED_PAGE_PATHS).toEqual(["/bindphone"]);
    expect(isPhoneRequiredPageAllowed("/bindphone")).toBe(true);
    expect(isPhoneRequiredPageAllowed("/bindphone/extra")).toBe(false);
    expect(isPhoneRequiredPageAllowed("/bindphone-impersonation")).toBe(false);
  });

  it.each(["/", "/admin/users", "/future-feature", "/login"])(
    "redirects a phone-less authenticated user from %s",
    async (path) => {
      getToken.mockResolvedValue({ id: "user-1", role: "SUPER_ADMIN", phone: null });
      const response = await middleware(request(path));
      const location = new URL(response.headers.get("location")!);
      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/bindphone");
      expect(location.searchParams.get("callbackUrl")).toBe(path);
    },
  );

  it("allows the exact binding page before profile and onboarding gates", async () => {
    getToken.mockResolvedValue({
      id: "user-1",
      phone: null,
      nickname: null,
      profileCompletionRequired: true,
      onboardingDone: false,
    });
    const response = await middleware(request("/bindphone?callbackUrl=%2Fadmin"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps anonymous login available and redirects other anonymous pages safely", async () => {
    getToken.mockResolvedValue(null);
    expect((await middleware(request("/login"))).headers.get("location")).toBeNull();
    expect((await middleware(request("/ban-appeal"))).headers.get("location")).toBeNull();

    const response = await middleware(request("/search?q=phone"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/search?q=phone");
  });

  it("lets a phone-bound user proceed to the existing gates", async () => {
    getToken.mockResolvedValue({
      id: "user-1",
      phone: "13800138000",
      nickname: "member",
      onboardingDone: true,
    });
    const response = await middleware(request("/discover"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
