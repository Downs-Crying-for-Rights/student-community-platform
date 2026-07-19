import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startHealthServer } from "./health.js";

let server: Server | undefined;
afterEach(() => server?.close());

async function baseUrl(ready: boolean): Promise<string> {
  server = startHealthServer("127.0.0.1", 0, { isReady: () => ready });
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("health server", () => {
  it("keeps liveness separate from readiness", async () => {
    const base = await baseUrl(false);
    const [live, health] = await Promise.all([fetch(`${base}/livez`), fetch(`${base}/healthz`)]);
    expect(live.status).toBe(200);
    expect(health.status).toBe(503);
    expect(health.headers.get("cache-control")).toBe("no-store");
  });

  it("reports ready connections", async () => {
    const response = await fetch(`${await baseUrl(true)}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });
});
