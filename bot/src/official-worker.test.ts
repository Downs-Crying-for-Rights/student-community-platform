import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { OfficialAppClient } from "./official-app-client.js";
import type { OfficialConfig } from "./official-config.js";
import { GatewayOpcode, QQ_OFFICIAL_INTENTS, type GatewayPayload } from "./official-protocol.js";
import { OfficialGatewayWorker } from "./official-worker.js";

async function waitFor(assertion: () => void, timeoutMs = 3_000): Promise<void> {
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

describe("OfficialGatewayWorker", () => {
  it("identifies, forwards message events, and resumes its session", async () => {
    const requests: Array<{ url: string; authorization?: string; body: string }> = [];
    let gatewayUrl = "";
    const api = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requests.push({
          url: request.url ?? "",
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          body,
        });
        response.setHeader("content-type", "application/json");
        if (request.url === "/token") response.end(JSON.stringify({ access_token: "qq-access-token", expires_in: "7200" }));
        else if (request.url === "/gateway/bot") response.end(JSON.stringify({ url: gatewayUrl }));
        else if (request.url === "/v1/internal/qq-official/events") response.end('{"status":"DELIVERED"}');
        else { response.statusCode = 404; response.end("{}"); }
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    const apiAddress = api.address();
    if (typeof apiAddress === "string" || apiAddress === null) throw new Error("HTTP server has no TCP address");

    const gateway = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(gateway, "listening");
    const gatewayAddress = gateway.address();
    if (typeof gatewayAddress === "string" || gatewayAddress === null) throw new Error("WS server has no TCP address");
    gatewayUrl = `ws://127.0.0.1:${gatewayAddress.port}/gateway`;

    const frames: GatewayPayload[][] = [];
    const sockets: WebSocket[] = [];
    gateway.on("connection", (socket) => {
      const connectionFrames: GatewayPayload[] = [];
      frames.push(connectionFrames);
      sockets.push(socket);
      socket.on("message", (raw) => connectionFrames.push(JSON.parse(raw.toString()) as GatewayPayload));
      socket.send(JSON.stringify({ op: GatewayOpcode.HELLO, d: { heartbeat_interval: 1_000 } }));
    });

    const origin = `http://127.0.0.1:${apiAddress.port}/`;
    const config: OfficialConfig = {
      appId: "102012345",
      clientSecret: "client-secret",
      tokenUrl: `${origin}token`,
      apiBaseUrl: origin,
      internalApiBaseUrl: origin,
      internalApiToken: "internal-secret",
      maxMessageBytes: 65_536,
      httpTimeoutMs: 1_000,
      reconnectMinMs: 100,
      reconnectMaxMs: 100,
      healthHost: "127.0.0.1",
      healthPort: 8_082,
    };
    const app = new OfficialAppClient(config);
    const forwardSpy = vi.spyOn(app, "forwardEvent");
    const worker = new OfficialGatewayWorker(config, app);

    try {
      worker.start();
      await waitFor(() => expect(frames[0]?.[0]).toMatchObject({
        op: GatewayOpcode.IDENTIFY,
        d: { token: "QQBot qq-access-token", intents: QQ_OFFICIAL_INTENTS },
      }));
      expect(requests).toContainEqual(expect.objectContaining({
        url: "/gateway/bot",
        authorization: "QQBot qq-access-token",
      }));

      sockets[0]?.send(JSON.stringify({ op: GatewayOpcode.HEARTBEAT_ACK }));
      sockets[0]?.send(JSON.stringify({ op: 0, s: 7, t: "READY", d: { session_id: "session-1" } }));
      const event = { op: 0, id: "event-1", s: 8, t: "C2C_MESSAGE_CREATE", d: { id: "message-1" } };
      sockets[0]?.send(JSON.stringify(event));
      await waitFor(() => expect(worker.isReady()).toBe(true));
      await waitFor(() => expect(forwardSpy).toHaveBeenCalledWith(event));
      await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({
        url: "/v1/internal/qq-official/events",
        authorization: "Bearer internal-secret",
        body: JSON.stringify(event),
      })));

      sockets[0]?.close(1012, "test reconnect");
      await waitFor(() => expect(frames.length).toBe(2));
      await waitFor(() => expect(frames[1]?.[0]).toEqual({
        op: GatewayOpcode.RESUME,
        d: { token: "QQBot qq-access-token", session_id: "session-1", seq: 8 },
      }));
    } finally {
      worker.stop();
      for (const socket of gateway.clients) socket.terminate();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      await new Promise<void>((resolve) => api.close(() => resolve()));
    }
  });
});
