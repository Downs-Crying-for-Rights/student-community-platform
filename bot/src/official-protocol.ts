export const QQ_OFFICIAL_INTENTS = 1 << 25;

export const GatewayOpcode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
  id?: string;
}

export interface GatewaySession {
  sessionId: string;
  sequence: number | null;
}

export function parseGatewayPayload(value: unknown): GatewayPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Number.isInteger(candidate.op)) return null;
  if (candidate.s !== undefined && candidate.s !== null && !Number.isInteger(candidate.s)) return null;
  if (candidate.t !== undefined && candidate.t !== null && typeof candidate.t !== "string") return null;
  return candidate as unknown as GatewayPayload;
}

export function identifyPayload(token: string): GatewayPayload {
  return {
    op: GatewayOpcode.IDENTIFY,
    d: {
      token: `QQBot ${token}`,
      intents: QQ_OFFICIAL_INTENTS,
      shard: [0, 1],
      properties: { $os: process.platform, $browser: "dcr-official-worker", $device: "dcr-official-worker" },
    },
  };
}

export function resumePayload(token: string, session: GatewaySession): GatewayPayload {
  return {
    op: GatewayOpcode.RESUME,
    d: { token: `QQBot ${token}`, session_id: session.sessionId, seq: session.sequence },
  };
}

export function heartbeatPayload(sequence: number | null): GatewayPayload {
  return { op: GatewayOpcode.HEARTBEAT, d: sequence };
}

export function heartbeatInterval(payload: GatewayPayload): number | null {
  if (!payload.d || typeof payload.d !== "object") return null;
  const value = (payload.d as { heartbeat_interval?: unknown }).heartbeat_interval;
  return Number.isSafeInteger(value) && Number(value) >= 1_000 && Number(value) <= 300_000
    ? Number(value)
    : null;
}

export function readySessionId(payload: GatewayPayload): string | null {
  if (payload.t !== "READY" || !payload.d || typeof payload.d !== "object") return null;
  const value = (payload.d as { session_id?: unknown }).session_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isForwardedEvent(payload: GatewayPayload): boolean {
  return payload.op === GatewayOpcode.DISPATCH &&
    (payload.t === "C2C_MESSAGE_CREATE" || payload.t === "GROUP_AT_MESSAGE_CREATE");
}
