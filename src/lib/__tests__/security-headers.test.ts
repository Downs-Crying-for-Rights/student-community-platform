import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

async function getGlobalHeaders() {
  const headerGroups = await nextConfig.headers!();
  const globalHeaders = headerGroups.find((group) => group.source === "/(.*)");
  expect(globalHeaders).toBeDefined();
  return globalHeaders!;
}

describe("Security Headers Configuration", () => {
  it("应禁用 X-Powered-By 头", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("应配置安全响应头", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeDefined();

    const headerGroups = await headersFn!();
    expect(headerGroups.length).toBeGreaterThan(0);

    const globalHeaders = await getGlobalHeaders();

    const headerMap = new Map(
      globalHeaders.headers.map((h: { key: string; value: string }) => [
        h.key,
        h.value,
      ]),
    );

    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(headerMap.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("应配置 Content-Security-Policy 头", async () => {
    const globalHeaders = await getGlobalHeaders();
    const headerMap = new Map(
      globalHeaders.headers.map((h: { key: string; value: string }) => [
        h.key,
        h.value,
      ]),
    );

    const csp = headerMap.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain("font-src 'self'");
  });
});
