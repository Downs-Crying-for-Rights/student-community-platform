export interface Config {
  oneBotWsUrl: string;
  oneBotAccessToken: string;
  expectedSelfId: string;
  allowedUserIds: ReadonlySet<string>;
  internalApiBaseUrl: string;
  internalApiToken: string;
  maxMessageBytes: number;
  httpTimeoutMs: number;
  heartbeatMs: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  outboxPollMs: number;
  outboxRetryMaxMs: number;
  actionTimeoutMs: number;
  healthHost: string;
  healthPort: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function url(value: string, protocols: string[], name: string): string {
  const parsed = new URL(value);
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} has an unsupported protocol`);
  if (parsed.username || parsed.password) throw new Error(`${name} must not contain credentials`);
  return parsed.toString();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const reconnectMinMs = integer(env, "RECONNECT_MIN_MS", 1_000, 100, 60_000);
  const reconnectMaxMs = integer(env, "RECONNECT_MAX_MS", 30_000, reconnectMinMs, 300_000);
  const allowedUserIds = new Set(
    required(env, "ONEBOT_ALLOWED_USER_IDS")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^[1-9]\d{4,11}$/.test(value)),
  );
  if (allowedUserIds.size === 0) {
    throw new Error("ONEBOT_ALLOWED_USER_IDS must contain at least one QQ ID");
  }

  return {
    oneBotWsUrl: url(required(env, "ONEBOT_WS_URL"), ["ws:", "wss:"], "ONEBOT_WS_URL"),
    oneBotAccessToken: required(env, "ONEBOT_ACCESS_TOKEN"),
    expectedSelfId: required(env, "ONEBOT_EXPECTED_SELF_ID"),
    allowedUserIds,
    internalApiBaseUrl: url(required(env, "INTERNAL_API_BASE_URL"), ["http:", "https:"], "INTERNAL_API_BASE_URL"),
    internalApiToken: required(env, "INTERNAL_API_TOKEN"),
    maxMessageBytes: integer(env, "MAX_MESSAGE_BYTES", 65_536, 1_024, 1_048_576),
    httpTimeoutMs: integer(env, "HTTP_TIMEOUT_MS", 10_000, 500, 120_000),
    heartbeatMs: integer(env, "WS_HEARTBEAT_MS", 30_000, 5_000, 300_000),
    reconnectMinMs,
    reconnectMaxMs,
    outboxPollMs: integer(env, "OUTBOX_POLL_MS", 3_000, 500, 60_000),
    outboxRetryMaxMs: integer(env, "OUTBOX_RETRY_MAX_MS", 30_000, 1_000, 300_000),
    actionTimeoutMs: integer(env, "ONEBOT_ACTION_TIMEOUT_MS", 10_000, 500, 120_000),
    healthHost: env.HEALTH_HOST?.trim() || "0.0.0.0",
    healthPort: integer(env, "HEALTH_PORT", 8_081, 1, 65_535),
  };
}
