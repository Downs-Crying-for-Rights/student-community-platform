import "server-only";

const ALLOWED_BASE_URLS = new Set(["https://api.deepseek.com"]);

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiConfig() {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  if (!ALLOWED_BASE_URLS.has(baseUrl)) throw new Error("AI_CONFIG_INVALID_BASE_URL");

  return {
    enabled: process.env.DEEPSEEK_ENABLED === "true",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl,
    defaultModel: process.env.DEEPSEEK_DEFAULT_MODEL || "deepseek-v4-flash",
    complexModel: process.env.DEEPSEEK_COMPLEX_MODEL || "deepseek-v4-flash",
    timeoutMs: parsePositiveInteger(process.env.DEEPSEEK_TIMEOUT_MS, 25_000),
    maxInputChars: parsePositiveInteger(process.env.DEEPSEEK_MAX_INPUT_CHARS, 12_000),
    maxOutputTokens: parsePositiveInteger(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS, 1_800),
  };
}
