import { describe, expect, it } from "vitest";
import {
  GatewayOpcode,
  QQ_OFFICIAL_INTENTS,
  heartbeatInterval,
  heartbeatPayload,
  identifyPayload,
  isForwardedEvent,
  parseGatewayPayload,
  readySessionId,
  resumePayload,
} from "./official-protocol.js";

describe("QQ official Gateway protocol", () => {
  it("builds identify, resume, and heartbeat frames", () => {
    expect(identifyPayload("access-token")).toMatchObject({
      op: GatewayOpcode.IDENTIFY,
      d: { token: "QQBot access-token", intents: QQ_OFFICIAL_INTENTS, shard: [0, 1] },
    });
    expect(resumePayload("access-token", { sessionId: "session-1", sequence: 42 })).toEqual({
      op: GatewayOpcode.RESUME,
      d: { token: "QQBot access-token", session_id: "session-1", seq: 42 },
    });
    expect(heartbeatPayload(null)).toEqual({ op: GatewayOpcode.HEARTBEAT, d: null });
  });

  it("validates hello and dispatch fields", () => {
    expect(heartbeatInterval({ op: 10, d: { heartbeat_interval: 45_000 } })).toBe(45_000);
    expect(heartbeatInterval({ op: 10, d: { heartbeat_interval: 10 } })).toBeNull();
    expect(readySessionId({ op: 0, t: "READY", d: { session_id: "session-1" } })).toBe("session-1");
    expect(parseGatewayPayload({ op: 0, s: "invalid" })).toBeNull();
  });

  it("forwards only the two subscribed message events", () => {
    expect(isForwardedEvent({ op: 0, t: "C2C_MESSAGE_CREATE" })).toBe(true);
    expect(isForwardedEvent({ op: 0, t: "GROUP_AT_MESSAGE_CREATE" })).toBe(true);
    expect(isForwardedEvent({ op: 0, t: "READY" })).toBe(false);
  });
});
