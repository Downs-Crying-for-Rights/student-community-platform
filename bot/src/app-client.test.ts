import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AppClient } from "./app-client.js";
import type { InternalMessageRequest } from "./types.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(() => servers.splice(0).forEach((server) => server.close()));

const request: InternalMessageRequest = {
  version: 1,
  eventId: "42:1",
  platform: "onebot11",
  selfId: "42",
  userId: "7",
  occurredAt: "2025-01-01T00:00:00.000Z",
  input: { type: "command", command: "状态" },
};

describe("AppClient", () => {
  it("authenticates and sends the event id as an idempotency key", async () => {
    let headers: Record<string, string | string[] | undefined> = {};
    const server = createServer((incoming, outgoing) => {
      headers = incoming.headers;
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify({ duplicate: false, replies: ["正常"], conversation: { state: "idle", revision: "1", prompt: null } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const client = new AppClient(`http://127.0.0.1:${port}`, "internal-secret", 1_000, 65_536);

    await expect(client.processMessage(request)).resolves.toMatchObject({ replies: ["正常"] });
    expect(headers.authorization).toBe("Bearer internal-secret");
    expect(headers["idempotency-key"]).toBe("42:1");
  });

  it("claims at most ten outbox items with authentication", async () => {
    let path = "";
    let authorization: string | undefined;
    let body = "";
    const server = createServer((incoming, outgoing) => {
      path = incoming.url ?? "";
      authorization = incoming.headers.authorization;
      incoming.on("data", (chunk) => (body += chunk.toString()));
      incoming.on("end", () => {
        outgoing.setHeader("content-type", "application/json");
        outgoing.end(JSON.stringify([{ id: "outbox-1", userId: "7", content: "通知" }]));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const client = new AppClient(`http://127.0.0.1:${port}`, "internal-secret", 1_000, 65_536);

    await expect(client.claimOutbox("42")).resolves.toEqual([{ id: "outbox-1", userId: "7", content: "通知" }]);
    expect(path).toBe("/v1/internal/onebot/outbox/claim");
    expect(authorization).toBe("Bearer internal-secret");
    expect(JSON.parse(body)).toEqual({ selfId: "42", limit: 10 });
  });

  it("acknowledges encoded outbox ids with the delivery result", async () => {
    let path = "";
    let body = "";
    const server = createServer((incoming, outgoing) => {
      path = incoming.url ?? "";
      incoming.on("data", (chunk) => (body += chunk.toString()));
      incoming.on("end", () => {
        outgoing.writeHead(204);
        outgoing.end();
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const client = new AppClient(`http://127.0.0.1:${port}`, "internal-secret", 1_000, 65_536);

    await client.ackOutbox("item/1", { success: true, providerMessageId: "99" });
    expect(path).toBe("/v1/internal/onebot/outbox/item%2F1/ack");
    expect(JSON.parse(body)).toEqual({ success: true, providerMessageId: "99" });
  });
});
