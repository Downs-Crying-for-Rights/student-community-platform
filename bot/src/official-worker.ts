import WebSocket, { type RawData } from "ws";
import { logger } from "./logger.js";
import type { OfficialAppClient } from "./official-app-client.js";
import type { OfficialConfig } from "./official-config.js";
import {
  GatewayOpcode,
  heartbeatInterval,
  heartbeatPayload,
  identifyPayload,
  isForwardedEvent,
  parseGatewayPayload,
  readySessionId,
  resumePayload,
  type GatewayPayload,
  type GatewaySession,
} from "./official-protocol.js";

interface AccessToken {
  value: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

export class OfficialGatewayWorker {
  private socket: WebSocket | null = null;
  private stopped = true;
  private ready = false;
  private heartbeatAcknowledged = false;
  private heartbeatStartedAt = 0;
  private heartbeatIntervalMs = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private helloTimer: NodeJS.Timeout | null = null;
  private token: AccessToken | null = null;
  private session: GatewaySession | null = null;
  private eventQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: OfficialConfig,
    private readonly app: OfficialAppClient,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ready = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.helloTimer = null;
    this.socket?.close(1000, "shutdown");
    this.socket = null;
  }

  isReady(): boolean {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || !this.heartbeatAcknowledged) return false;
    return this.heartbeatIntervalMs > 0 && Date.now() - this.heartbeatStartedAt <= this.heartbeatIntervalMs * 2;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.ready = false;
    this.heartbeatAcknowledged = false;
    try {
      const token = await this.getAccessToken();
      const gateway = await this.getGateway(token);
      if (this.stopped) return;
      this.openSocket(gateway.url, gateway.token);
    } catch {
      logger.warn("qq_official_connect_failed");
      this.scheduleReconnect();
    }
  }

  private async getAccessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - Date.now() > 60_000) return this.token.value;
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appId: this.config.appId, clientSecret: this.config.clientSecret }),
      signal: AbortSignal.timeout(this.config.httpTimeoutMs),
    });
    if (!response.ok) throw new Error(`QQ token endpoint returned ${response.status}`);
    const body = await response.json() as TokenResponse;
    const expiresIn = typeof body.expires_in === "string" ? Number(body.expires_in) : body.expires_in;
    if (typeof body.access_token !== "string" || body.access_token.length === 0 ||
      !Number.isFinite(expiresIn) || Number(expiresIn) <= 0) {
      throw new Error("QQ token endpoint returned an invalid response");
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(expiresIn) * 1_000 };
    return this.token.value;
  }

  private async getGateway(token: string): Promise<{ url: string; token: string }> {
    let response = await this.fetchGateway(token);
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      token = await this.getAccessToken(true);
      response = await this.fetchGateway(token);
    }
    if (!response.ok) throw new Error(`QQ gateway endpoint returned ${response.status}`);
    const body = await response.json() as { url?: unknown };
    if (typeof body.url !== "string") throw new Error("QQ gateway endpoint returned an invalid response");
    const url = new URL(body.url);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("QQ gateway URL has an unsupported protocol");
    if (url.username || url.password) throw new Error("QQ gateway URL must not contain credentials");
    return { url: url.toString(), token };
  }

  private fetchGateway(token: string): Promise<Response> {
    return fetch(new URL("gateway/bot", this.config.apiBaseUrl), {
      headers: { authorization: `QQBot ${token}` },
      signal: AbortSignal.timeout(this.config.httpTimeoutMs),
    });
  }

  private openSocket(url: string, token: string): void {
    const socket = new WebSocket(url, {
      maxPayload: this.config.maxMessageBytes,
      handshakeTimeout: this.config.httpTimeoutMs,
    });
    this.socket = socket;
    socket.on("open", () => {
      this.helloTimer = setTimeout(() => socket.terminate(), this.config.httpTimeoutMs);
      logger.info("qq_official_gateway_connected");
    });
    socket.on("message", (data, isBinary) => this.onMessage(socket, token, data, isBinary));
    socket.on("error", () => logger.warn("qq_official_socket_error"));
    socket.on("unexpected-response", (_request, response) => {
      if (response.statusCode === 401) this.token = null;
      logger.warn("qq_official_handshake_rejected", { status: response.statusCode ?? 0 });
    });
    socket.on("close", (code) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      if (this.helloTimer) clearTimeout(this.helloTimer);
      this.helloTimer = null;
      this.stopHeartbeat();
      logger.warn("qq_official_gateway_disconnected", { code });
      this.scheduleReconnect();
    });
  }

  private onMessage(socket: WebSocket, token: string, data: RawData, isBinary: boolean): void {
    const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    if (isBinary || raw.byteLength > this.config.maxMessageBytes) return;
    let value: unknown;
    try {
      value = JSON.parse(raw.toString("utf8"));
    } catch {
      logger.warn("qq_official_invalid_json");
      return;
    }
    const payload = parseGatewayPayload(value);
    if (!payload) {
      logger.warn("qq_official_invalid_payload");
      return;
    }
    if (typeof payload.s === "number") {
      if (this.session) this.session.sequence = payload.s;
    }
    this.handlePayload(socket, token, payload);
  }

  private handlePayload(socket: WebSocket, token: string, payload: GatewayPayload): void {
    switch (payload.op) {
      case GatewayOpcode.HELLO: {
        if (this.helloTimer) clearTimeout(this.helloTimer);
        this.helloTimer = null;
        const interval = heartbeatInterval(payload);
        if (interval === null) {
          socket.close(1002, "invalid hello");
          return;
        }
        this.startHeartbeat(socket, interval);
        this.send(socket, this.session ? resumePayload(token, this.session) : identifyPayload(token));
        return;
      }
      case GatewayOpcode.HEARTBEAT:
        this.sendHeartbeat(socket);
        return;
      case GatewayOpcode.HEARTBEAT_ACK:
        this.heartbeatAcknowledged = true;
        return;
      case GatewayOpcode.DISPATCH:
        this.handleDispatch(payload);
        return;
      case GatewayOpcode.RECONNECT:
        socket.close(1012, "server requested reconnect");
        return;
      case GatewayOpcode.INVALID_SESSION:
        this.session = null;
        this.ready = false;
        socket.close(1012, "invalid session");
        return;
      default:
        return;
    }
  }

  private handleDispatch(payload: GatewayPayload): void {
    const sessionId = readySessionId(payload);
    if (sessionId) this.session = { sessionId, sequence: typeof payload.s === "number" ? payload.s : null };
    if (payload.t === "READY" || payload.t === "RESUMED") {
      this.ready = true;
      this.reconnectAttempt = 0;
      logger.info("qq_official_gateway_ready", { resumed: payload.t === "RESUMED" });
    }
    if (!isForwardedEvent(payload)) return;
    this.eventQueue = this.eventQueue
      .then(() => this.forwardWithRetry(payload))
      .catch(() => logger.error("qq_official_event_forward_failed"));
  }

  private async forwardWithRetry(payload: GatewayPayload): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.app.forwardEvent(payload);
        return;
      } catch {
        if (attempt === 2 || this.stopped) throw new Error("event forwarding exhausted");
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }

  private startHeartbeat(socket: WebSocket, interval: number): void {
    this.stopHeartbeat();
    this.heartbeatIntervalMs = interval;
    this.heartbeatAcknowledged = true;
    this.heartbeatStartedAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (!this.heartbeatAcknowledged) {
        socket.terminate();
        return;
      }
      this.sendHeartbeat(socket);
    }, interval);
  }

  private sendHeartbeat(socket: WebSocket): void {
    this.heartbeatAcknowledged = false;
    this.heartbeatStartedAt = Date.now();
    this.send(socket, heartbeatPayload(this.session?.sequence ?? null));
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.heartbeatIntervalMs = 0;
    this.heartbeatAcknowledged = false;
  }

  private send(socket: WebSocket, payload: GatewayPayload): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const exponential = Math.min(
      this.config.reconnectMaxMs,
      this.config.reconnectMinMs * 2 ** Math.min(this.reconnectAttempt++, 20),
    );
    const delay = Math.round(exponential * (0.75 + Math.random() * 0.5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    logger.info("qq_official_reconnect_scheduled", { delayMs: delay });
  }
}
