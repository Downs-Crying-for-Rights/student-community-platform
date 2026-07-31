export interface OfficialConfig {
  appId: string;
  clientSecret: string;
  tokenUrl: string;
  apiBaseUrl: string;
  internalApiBaseUrl: string;
  internalApiToken: string;
  maxMessageBytes: number;
  httpTimeoutMs: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  healthHost: string;
  healthPort: number;
}

type Environment = Readonly<Record<string, string | undefined>>;

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(env: Environment, name: string, fallback: number, min: number, max: number): number {
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

export function loadOfficialConfig(env: Environment = process.env): OfficialConfig {
  const reconnectMinMs = integer(env, "RECONNECT_MIN_MS", 1_000, 100, 60_000);
  const reconnectMaxMs = integer(env, "RECONNECT_MAX_MS", 30_000, reconnectMinMs, 300_000);
  const healthPort = integer(env, "HEALTH_PORT", 8_082, 1, 65_535);

  return {
    appId: required(env, "QQ_OFFICIAL_BOT_APP_ID"),
    clientSecret: required(env, "QQ_OFFICIAL_BOT_CLIENT_SECRET"),
    tokenUrl: url(
      env.QQ_OFFICIAL_TOKEN_URL?.trim() || "https://bots.qq.com/app/getAppAccessToken",
      ["http:", "https:"],
      "QQ_OFFICIAL_TOKEN_URL",
    ),
    apiBaseUrl: url(
      env.QQ_OFFICIAL_API_BASE_URL?.trim() || "https://api.sgroup.qq.com",
      ["http:", "https:"],
      "QQ_OFFICIAL_API_BASE_URL",
    ),
    internalApiBaseUrl: url(required(env, "INTERNAL_API_BASE_URL"), ["http:", "https:"], "INTERNAL_API_BASE_URL"),
    internalApiToken: required(env, "INTERNAL_API_TOKEN"),
    maxMessageBytes: integer(env, "MAX_MESSAGE_BYTES", 65_536, 1_024, 1_048_576),
    httpTimeoutMs: integer(env, "HTTP_TIMEOUT_MS", 10_000, 500, 120_000),
    reconnectMinMs,
    reconnectMaxMs,
    healthHost: env.OFFICIAL_HEALTH_HOST?.trim() || env.HEALTH_HOST?.trim() || "0.0.0.0",
    healthPort: integer(env, "OFFICIAL_HEALTH_PORT", healthPort, 1, 65_535),
  };
}
