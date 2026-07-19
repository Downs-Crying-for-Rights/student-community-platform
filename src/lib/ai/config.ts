import "server-only";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  complexModel: string;
  timeoutMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
  revision: number;
  source: "database" | "environment";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEnvironmentAiConfig(): AiConfig {
  return {
    enabled: process.env.DEEPSEEK_ENABLED === "true",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-v4-flash",
    complexModel: process.env.DEEPSEEK_COMPLEX_MODEL || "deepseek-v4-flash",
    timeoutMs: parsePositiveInteger(process.env.DEEPSEEK_TIMEOUT_MS, 25_000),
    maxInputChars: parsePositiveInteger(process.env.DEEPSEEK_MAX_INPUT_CHARS, 12_000),
    maxOutputTokens: parsePositiveInteger(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS, 1_800),
    revision: 0,
    source: "environment",
  };
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:");
}

export async function validateAiBaseUrl(value: string): Promise<string> {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("AI_CONFIG_INVALID_BASE_URL");
  }
  if (url.port && url.port !== "443") throw new Error("AI_CONFIG_INVALID_BASE_URL");
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("AI_CONFIG_INVALID_BASE_URL");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("AI_CONFIG_INVALID_BASE_URL");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("AI_CONFIG_INVALID_BASE_URL");
  }
  return `https://${hostname}`;
}
