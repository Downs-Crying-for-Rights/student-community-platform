import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { Config } from "./config.js";
import { EventProcessor } from "./event-processor.js";
import { OneBotWorker } from "./onebot-worker.js";
import type { AppApi, InternalMessageResponse, OneBotAction } from "./types.js";

const messageResponse: InternalMessageResponse = {
  duplicate: false,
  replies: [],
  conversation: { state: "idle", revision: "1", prompt: null },
};

async function waitFor(assertion: () => void, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe("OneBotWorker outbox", () => {
  it.each([
    {
      name: "acknowledges a correlated successful send with the provider message id",
      response: { status: "ok", retcode: 0, data: { message_id: 987 } },
      expectedAck: { success: true, providerMessageId: "987" },
    },
    {
      name: "acknowledges a correlated rejected send",
      response: { status: "failed", retcode: 100 },
      expectedAck: { success: false, errorCode: "ONEBOT_REJECTED" },
    },
  ])("$name", async ({ response, expectedAck }) => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const address = server.address();
    if (typeof address === "string" || address === null) throw new Error("WebSocket server has no TCP address");

    let connection: WebSocket | undefined;
    let authorization: string | undefined;
    let loginRequest: OneBotAction | undefined;
    server.on("connection", (socket, request) => {
      connection = socket;
      authorization = request.headers.authorization;
      socket.on("message", (raw) => {
        const action = JSON.parse(raw.toString()) as OneBotAction;
        if (action.action === "get_login_info") loginRequest = action;
        if (action.action === "send_private_msg") socket.send(JSON.stringify({ ...response, echo: action.echo }));
      });
    });

    let claimCount = 0;
    const app: AppApi = {
      processMessage: vi.fn().mockResolvedValue(messageResponse),
      claimOutbox: vi.fn().mockImplementation(async () => {
        claimCount += 1;
        return claimCount === 1 ? [{ id: "private-outbox-id", userId: "7", content: "私密通知" }] : [];
      }),
      ackOutbox: vi.fn().mockResolvedValue(undefined),
    };
    const config: Config = {
      oneBotWsUrl: `ws://127.0.0.1:${address.port}/`,
      oneBotAccessToken: "onebot-secret",
      expectedSelfId: "42",
      internalApiBaseUrl: "http://127.0.0.1/",
      internalApiToken: "internal-secret",
      maxMessageBytes: 65_536,
      httpTimeoutMs: 1_000,
      heartbeatMs: 30_000,
      reconnectMinMs: 1_000,
      reconnectMaxMs: 30_000,
      outboxPollMs: 30_000,
      outboxRetryMaxMs: 30_000,
      actionTimeoutMs: 1_000,
      healthHost: "127.0.0.1",
      healthPort: 8_081,
    };
    const worker = new OneBotWorker(config, new EventProcessor(app, "42", new Set(["100"]), 65_536), app);

    try {
      worker.start();
      await waitFor(() => expect(connection).toBeDefined());
      expect(app.claimOutbox).not.toHaveBeenCalled();
      expect(authorization).toBe("Bearer onebot-secret");

      await waitFor(() => expect(loginRequest).toBeDefined());
      connection?.send(JSON.stringify({ status: "ok", retcode: 0, data: { user_id: 42 }, echo: loginRequest?.echo }));

      await waitFor(() => expect(app.ackOutbox).toHaveBeenCalledWith("private-outbox-id", expectedAck));
      expect(app.claimOutbox).toHaveBeenCalledWith("42");
    } finally {
      worker.stop();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
