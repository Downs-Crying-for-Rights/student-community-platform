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

  it("authenticates with NapCat and returns a refreshed QR credential", async () => {
    const paths: string[] = [];
    const server = createServer((request, response) => {
      paths.push(request.url ?? "");
      response.setHeader("content-type", "application/json");
      if (request.url === "/api/auth/login") {
        response.end(JSON.stringify({ code: 0, data: { Credential: "signed" } }));
      } else if (request.url === "/api/QQLogin/CheckLoginStatus") {
        response.end(JSON.stringify({ code: 0, data: { isLogin: false, isOffline: false, qrcodeurl: "https://qq.example/login" } }));
      } else {
        response.end(JSON.stringify({ code: 0, data: null }));
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const state = createApp({
      id: "f9c74a69-3b0f-4a13-b961-166aae661234",
      action: "REFRESH_LOGIN",
      requestedAt: new Date().toISOString(),
    });
    const runner = new QQBotOperationRunner(state.client, `http://127.0.0.1:${port}`, "webui-secret");
    runner.start();
    await vi.waitFor(() => expect(state.reports).toHaveLength(1), { timeout: 3_000 });
    expect(paths).toContain("/api/QQLogin/RefreshQRcode");
    expect(state.reports[0]).toMatchObject({
      status: "SUCCEEDED",
      login: { qrcode: "https://qq.example/login", smsSupported: false },
    });
    runner.stop();
  });
});
