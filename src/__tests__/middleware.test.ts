import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getToken = vi.hoisted(() => vi.fn());
vi.mock("next-auth/jwt", () => ({ getToken }));

import middleware, {
  config,
  isInternalApiPath,
  isPublicBuildInfoPath,
} from "../middleware";

const request = (path: string) => new NextRequest(`https://example.test${path}`);

describe("authentication middleware", () => {
  beforeEach(() => getToken.mockReset());

  it("matches every page while excluding APIs, internals, and static files", () => {
    expect(config.matcher).toEqual([
      "/((?!api(?:/|$)|v1/internal(?:/|$)|_next(?:/|$)|.*\\..*).*)",
    ]);
  });

  it("leaves bearer-authenticated internal APIs outside session redirects", async () => {
    getToken.mockResolvedValue(null);

    expect(isInternalApiPath("/v1/internal/onebot/outbox/claim")).toBe(true);
    expect(isInternalApiPath("/v1/public")).toBe(false);
    const response = await middleware(request("/v1/internal/onebot/outbox/claim"));

    expect(response.headers.get("location")).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
  });

  it("keeps exact build information files public without widening the exception", async () => {
    getToken.mockResolvedValue(null);

    for (const path of ["/DEPLOYMENT", "/VERSION"]) {
      expect(isPublicBuildInfoPath(path)).toBe(true);
      const response = await middleware(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("cache-control")).toContain("no-store");
    }

    expect(isPublicBuildInfoPath("/DEPLOYMENT/history")).toBe(false);
    expect(isPublicBuildInfoPath("/VERSION-preview")).toBe(false);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("does not require a phone before the existing profile and onboarding gates", async () => {
    getToken.mockResolvedValue({
      id: "user-1",
      phone: null,
      nickname: "member",
      profileCompletionRequired: false,
      onboardingDone: true,
    });
    const response = await middleware(request("/discover"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("private");
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
