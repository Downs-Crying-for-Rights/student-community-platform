import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { Config } from "./config.js";
import { EventProcessor } from "./event-processor.js";
import { logger } from "./logger.js";
import type {
  AppApi,
  OneBotAction,
  OneBotActionResponse,
  OutboxAck,
  OutboxErrorCode,
  OutboxItem,
} from "./types.js";

interface PendingAction {
  resolve: (response: OneBotActionResponse) => void;
  reject: (errorCode: OutboxErrorCode) => void;
  timer: NodeJS.Timeout;
}

const ACCOUNT_RESTART_COOLDOWN_MS = 5 * 60_000;
const ACCOUNT_RESTART_GRACE_MS = 60_000;

export class OneBotWorker {
  private socket: WebSocket | null = null;
  private stopped = false;
  private verified = false;
  private lastPong = 0;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private loginEcho = "";
  private messageQueue: Promise<void> = Promise.resolve();
  private outboxTimer: NodeJS.Timeout | null = null;
  private reconnectFailureTimer: NodeJS.Timeout | null = null;
  private outboxFailures = 0;
  private accountOnline = false;
  private accountStatusCheckedAt = 0;
  private reconnectAttemptedAt = 0;
  private readonly pendingActions = new Map<string, PendingAction>();

  constructor(
    private readonly config: Config,
    private readonly processor: EventProcessor,
    private readonly app: AppApi,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.verified = false;
    this.accountOnline = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.outboxTimer) clearTimeout(this.outboxTimer);
    if (this.reconnectFailureTimer) clearTimeout(this.reconnectFailureTimer);
    this.rejectPendingActions("CONNECTION_LOST");
    this.socket?.close(1000, "shutdown");
  }

  isReady(): boolean {
    return (
      this.isTransportReady() &&
      this.accountOnline &&
      Date.now() - this.accountStatusCheckedAt <= this.config.heartbeatMs * 2
    );
  }

  private isTransportReady(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.verified &&
      Date.now() - this.lastPong <= this.config.heartbeatMs * 2;
  }

  private connect(): void {
    if (this.stopped) return;
    this.verified = false;
    this.accountOnline = false;
    const socket = new WebSocket(this.config.oneBotWsUrl, {
      headers: { authorization: `Bearer ${this.config.oneBotAccessToken}` },
      maxPayload: this.config.maxMessageBytes,
      handshakeTimeout: this.config.httpTimeoutMs,
    });
    this.socket = socket;

    socket.on("open", () => {
      this.attempt = 0;
      this.lastPong = Date.now();
      this.loginEcho = `login:${randomUUID()}`;
      this.send({ action: "get_login_info", params: {}, echo: this.loginEcho });
      this.startHeartbeat(socket);
      logger.info("onebot_connected");
    });
    socket.on("pong", () => {
      this.lastPong = Date.now();
    });
    socket.on("message", (data, isBinary) => {
      this.messageQueue = this.messageQueue
        .then(() => this.onMessage(socket, data, isBinary))
        .catch(() => logger.error("onebot_message_handler_failed"));
    });
    socket.on("error", () => logger.warn("onebot_socket_error"));
    socket.on("unexpected-response", (_request, response) => {
      logger.warn("onebot_handshake_rejected", { status: response.statusCode ?? 0 });
    });
    socket.on("close", (code) => {
      this.verified = false;
      this.accountOnline = false;
      if (this.outboxTimer) clearTimeout(this.outboxTimer);
      this.outboxTimer = null;
      this.rejectPendingActions("CONNECTION_LOST");
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      logger.warn("onebot_disconnected", { code });
      this.scheduleReconnect();
    });
  }

  private startHeartbeat(socket: WebSocket): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > this.config.heartbeatMs * 2) {
        socket.terminate();
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }, this.config.heartbeatMs);
  }

  private async onMessage(socket: WebSocket, data: RawData, isBinary: boolean): Promise<void> {
    const payload = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    if (isBinary || payload.byteLength > this.config.maxMessageBytes) return;
    let value: unknown;
    try {
      value = JSON.parse(payload.toString("utf8"));
    } catch {
      logger.warn("onebot_invalid_json");
      return;
    }

    if (this.isLoginResponse(value)) {
      if (value.status !== "ok" || !value.data || !("user_id" in value.data)) {
        logger.error("onebot_identity_check_failed");
        socket.close(1011, "identity check failed");
        return;
      }
      const selfId = String(value.data.user_id);
      if (selfId !== this.config.expectedSelfId) {
        logger.error("onebot_self_id_mismatch");
        socket.close(1008, "unexpected self_id");
        return;
      }
      this.verified = true;
      this.outboxFailures = 0;
      this.scheduleOutboxPoll(0);
      logger.info("onebot_identity_verified");
      return;
    }
    if (this.resolveActionResponse(value)) return;
    if (!this.verified) return;

    const outcome = await this.processor.process(value, (action) => this.send(action));
    if (outcome === "failed") logger.warn("message_processing_failed");
  }

  private isLoginResponse(value: unknown): value is {
    echo: string;
    status?: unknown;
    data?: { user_id?: unknown } | null;
  } {
    if (!value || typeof value !== "object") return false;
    return (value as { echo?: unknown }).echo === this.loginEcho;
  }

  private send(action: OneBotAction): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify(action);
    if (Buffer.byteLength(payload, "utf8") > this.config.maxMessageBytes) {
      logger.warn("onebot_action_too_large");
      return;
    }
    this.socket.send(payload);
  }

  private resolveActionResponse(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<OneBotActionResponse>;
    if (typeof candidate.echo !== "string") return false;
    const pending = this.pendingActions.get(candidate.echo);
    if (!pending) return false;
    this.pendingActions.delete(candidate.echo);
    clearTimeout(pending.timer);
    if (
      (candidate.status !== "ok" && candidate.status !== "failed") ||
      typeof candidate.retcode !== "number"
    ) {
      pending.reject("ONEBOT_REJECTED");
      return true;
    }
    pending.resolve(candidate as OneBotActionResponse);
    return true;
  }

  private sendOutboxItem(item: OutboxItem): Promise<OneBotActionResponse> {
    return this.sendAction("send_private_msg", { user_id: item.userId, message: item.content });
  }

  private sendAction(action: string, params: Record<string, unknown>): Promise<OneBotActionResponse> {
    return new Promise((resolve, reject: (errorCode: OutboxErrorCode) => void) => {
      if (!this.isTransportReady()) {
        reject("CONNECTION_LOST");
        return;
      }
      const echo = `action:${randomUUID()}`;
      const payload = JSON.stringify({ action, params, echo });
      if (Buffer.byteLength(payload, "utf8") > this.config.maxMessageBytes) {
        reject("ACTION_TOO_LARGE");
        return;
      }
      const timer = setTimeout(() => {
        this.pendingActions.delete(echo);
        reject("ONEBOT_TIMEOUT");
      }, this.config.actionTimeoutMs);
      this.pendingActions.set(echo, { resolve, reject, timer });
      this.socket?.send(payload, (error) => {
        if (!error) return;
        const pending = this.pendingActions.get(echo);
        if (!pending) return;
        this.pendingActions.delete(echo);
        clearTimeout(pending.timer);
        pending.reject("CONNECTION_LOST");
      });
    });
  }

  private scheduleOutboxPoll(delay: number): void {
    if (this.stopped || !this.verified || this.outboxTimer) return;
    this.outboxTimer = setTimeout(() => {
      this.outboxTimer = null;
      void this.pollOutbox();
    }, delay);
  }

  private async pollOutbox(): Promise<void> {
    if (!this.isTransportReady()) return;
    try {
      const checkedAt = new Date();
      this.accountOnline = await this.probeAccountStatus();
      this.accountStatusCheckedAt = checkedAt.getTime();
      if (this.accountOnline) {
        this.reconnectAttemptedAt = 0;
        if (this.reconnectFailureTimer) clearTimeout(this.reconnectFailureTimer);
        this.reconnectFailureTimer = null;
      }
      const shouldRestart = !this.accountOnline &&
        checkedAt.getTime() - this.reconnectAttemptedAt >= ACCOUNT_RESTART_COOLDOWN_MS;
      if (shouldRestart) this.reconnectAttemptedAt = checkedAt.getTime();
      const items = await this.app.claimOutbox(this.config.expectedSelfId, {
        oneBotConnected: true,
        accountOnline: this.accountOnline,
        checkedAt: checkedAt.toISOString(),
        ...(this.reconnectAttemptedAt > 0
          ? {
              reconnectAttemptedAt: new Date(this.reconnectAttemptedAt).toISOString(),
              reconnectFailed: checkedAt.getTime() - this.reconnectAttemptedAt >= ACCOUNT_RESTART_GRACE_MS,
            }
          : {}),
      });
      this.outboxFailures = 0;
      if (!this.accountOnline) {
        logger.warn("qq_account_offline", { reconnectRequested: shouldRestart });
        if (shouldRestart) {
          this.scheduleReconnectFailureReport();
          void this.sendAction("set_restart", { delay: 1_000 })
            .catch(() => logger.warn("qq_account_restart_request_failed"));
        }
      }
      for (const item of items) await this.deliverOutboxItem(item);
      this.scheduleOutboxPoll(this.config.outboxPollMs);
    } catch {
      logger.warn("outbox_claim_failed");
      const delay = Math.min(
        this.config.outboxRetryMaxMs,
        this.config.outboxPollMs * 2 ** Math.min(this.outboxFailures++, 10),
      );
      this.scheduleOutboxPoll(delay);
    }
  }

  private scheduleReconnectFailureReport(): void {
    if (this.reconnectFailureTimer) clearTimeout(this.reconnectFailureTimer);
    const attemptedAt = new Date(this.reconnectAttemptedAt).toISOString();
    this.reconnectFailureTimer = setTimeout(() => {
      this.reconnectFailureTimer = null;
      if (this.accountOnline || this.stopped) return;
      void this.app.claimOutbox(this.config.expectedSelfId, {
        oneBotConnected: this.isTransportReady(),
        accountOnline: false,
        checkedAt: new Date().toISOString(),
        reconnectAttemptedAt: attemptedAt,
        reconnectFailed: true,
      }).catch(() => logger.warn("qq_account_restart_failure_report_failed"));
    }, ACCOUNT_RESTART_GRACE_MS);
  }

  private async probeAccountStatus(): Promise<boolean> {
    try {
      const response = await this.sendAction("get_status", {});
      return response.status === "ok" && response.retcode === 0 &&
        response.data?.online === true && response.data.good !== false;
    } catch {
      return false;
    }
  }

  private async deliverOutboxItem(item: OutboxItem): Promise<void> {
    let ack: OutboxAck;
    try {
      const response = await this.sendOutboxItem(item);
      if (response.status === "ok" && response.retcode === 0) {
        const candidateMessageId = response.data?.message_id;
        const messageId =
          typeof candidateMessageId === "string" || typeof candidateMessageId === "number"
            ? String(candidateMessageId)
            : undefined;
        ack = {
          success: true,
          ...(messageId === undefined ? {} : { providerMessageId: String(messageId) }),
        };
      } else {
        ack = { success: false, errorCode: "ONEBOT_REJECTED" };
      }
    } catch (errorCode) {
      ack = { success: false, errorCode: errorCode as OutboxErrorCode };
    }

    try {
      await this.app.ackOutbox(item.id, ack);
    } catch {
      logger.warn("outbox_ack_failed");
    }
  }

  private rejectPendingActions(errorCode: OutboxErrorCode): void {
    for (const pending of this.pendingActions.values()) {
      clearTimeout(pending.timer);
      pending.reject(errorCode);
    }
    this.pendingActions.clear();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const exponential = Math.min(this.config.reconnectMaxMs, this.config.reconnectMinMs * 2 ** this.attempt++);
    const delay = Math.round(exponential * (0.75 + Math.random() * 0.5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    logger.info("onebot_reconnect_scheduled", { delayMs: delay });
  }
}
