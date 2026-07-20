import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppClient } from "./app-client.js";
import { QQBotOperationRunner } from "./operations.js";
import type { QQBotOperationCommand, QQBotOperationResult } from "./types.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => {
  vi.useRealTimers();
  servers.splice(0).forEach((server) => server.close());
});

function createApp(command: QQBotOperationCommand | null) {
  const reports: QQBotOperationResult[] = [];
  return {
    client: {
      claimOperation: vi.fn().mockResolvedValue(command),
      reportOperation: vi.fn(async (result: QQBotOperationResult) => { reports.push(result); }),
    } as unknown as AppClient,
    reports,
  };
}

describe("QQBotOperationRunner", () => {
  it("reports before exiting for a worker restart", async () => {
    const state = createApp({
      id: "f9c74a69-3b0f-4a13-b961-166aae661234",
      leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632",
      action: "RESTART_WORKER",
      requestedAt: new Date().toISOString(),
    });
    const exit = vi.fn();
    vi.useFakeTimers();
    const runner = new QQBotOperationRunner(state.client, "http://127.0.0.1:6099", "", exit);
    runner.start();
    await vi.waitFor(() => expect(state.reports).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(300);
    expect(state.reports[0]).toMatchObject({ action: "RESTART_WORKER", status: "SUCCEEDED" });
    expect(exit).toHaveBeenCalledOnce();
    runner.stop();
  });

  it("authenticates with NapCat and refreshes an existing QR credential", async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/auth/login") {
        response.end(JSON.stringify({ code: 0, data: { Credential: "signed" } }));
      } else if (request.url === "/api/QQLogin/CheckLoginStatus") {
        const refreshed = paths.includes("/api/QQLogin/RefreshQRcode");
        response.end(JSON.stringify({ code: 0, data: { isLogin: false, isOffline: false, qrcodeurl: refreshed ? "https://qq.example/new-login" : "https://qq.example/login" } }));
      } else {
        response.end(JSON.stringify({ code: 0, data: null }));
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const state = createApp({
      id: "f9c74a69-3b0f-4a13-b961-166aae661234",
      leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632",
      action: "REFRESH_LOGIN",
      requestedAt: new Date().toISOString(),
    });
    const runner = new QQBotOperationRunner(state.client, `http://127.0.0.1:${port}`, "webui-secret");
    runner.start();
    await vi.waitFor(() => expect(state.reports).toHaveLength(1), { timeout: 3_000 });
    expect(paths).toContain("/api/QQLogin/RefreshQRcode");
    expect(state.reports[0]).toMatchObject({
      status: "SUCCEEDED",
      login: { qrcode: "https://qq.example/new-login", smsSupported: false },
    });
    runner.stop();
  });

  it("waits for a newly generated QR instead of reporting success immediately", async () => {
    let checks = 0;
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/auth/login") {
        response.end(JSON.stringify({ code: 0, data: { Credential: "signed" } }));
      } else if (request.url === "/api/QQLogin/CheckLoginStatus") {
        checks += 1;
        response.end(JSON.stringify({ code: 0, data: {
          isLogin: false,
          isOffline: false,
          qrcodeurl: checks >= 3 ? "https://qq.example/new-login" : null,
        } }));
      } else {
        response.end(JSON.stringify({ code: 0, data: null }));
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const state = createApp({
      id: "f9c74a69-3b0f-4a13-b961-166aae661234",
      leaseToken: "f8a0a6ca-40e5-41c7-a829-055cf8eaa632",
      action: "REFRESH_LOGIN",
      requestedAt: new Date().toISOString(),
    });
    const runner = new QQBotOperationRunner(state.client, `http://127.0.0.1:${port}`, "webui-secret");
    runner.start();
    await vi.waitFor(() => expect(state.reports).toHaveLength(1), { timeout: 5_000 });
    expect(paths).toContain("/api/QQLogin/RefreshQRcode");
    expect(checks).toBeGreaterThanOrEqual(3);
    expect(state.reports[0]).toMatchObject({ status: "SUCCEEDED", login: { qrcode: "https://qq.example/new-login" } });
    runner.stop();
  });
});
