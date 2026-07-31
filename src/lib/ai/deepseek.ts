import "server-only";
import { getAiConfig } from "./runtime-config";
import { aiReviewResultSchema, type AiReviewResult } from "./schemas";

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class AiProviderError extends Error {
  constructor(public readonly code: string, public readonly status = 502) {
    super(code);
  }
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function fetchDeepSeek(url: string, init: RequestInit, timeoutMs: number) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) return response;
    } catch (error) {
      if (attempt === 1) {
        if (error instanceof Error && error.name === "TimeoutError") throw new AiProviderError("AI_TIMEOUT", 504);
        throw new AiProviderError("AI_NETWORK_ERROR", 502);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new AiProviderError("AI_NETWORK_ERROR", 502);
}

export async function requestDeepSeekReview(input: {
  systemPrompt: string;
  content: string;
  userId: string;
  complex?: boolean;
}): Promise<{ result: AiReviewResult; model: string; usage: DeepSeekResponse["usage"] }> {
  const config = await getAiConfig();
  if (!config.enabled || !config.apiKey) throw new AiProviderError("AI_DISABLED", 503);
  if (input.content.length > config.maxInputChars) throw new AiProviderError("AI_INPUT_TOO_LARGE", 413);
  const model = input.complex ? config.complexModel : config.defaultModel;

  const response = await fetchDeepSeek(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.content },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: config.maxOutputTokens,
      temperature: 0,
      user_id: input.userId,
    }),
    redirect: "error",
  }, config.timeoutMs);

  if (!response.ok) {
    if (response.status === 429) throw new AiProviderError("AI_RATE_LIMITED", 503);
    throw new AiProviderError("AI_PROVIDER_ERROR", 502);
  }

  const body = await response.json() as DeepSeekResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new AiProviderError("AI_EMPTY_RESPONSE", 502);
  try {
    const result = aiReviewResultSchema.parse(JSON.parse(content));
    return { result, model, usage: body.usage };
  } catch {
    throw new AiProviderError("AI_INVALID_RESPONSE", 502);
  }
}

export async function requestDeepSeekChat(input: {
  systemPrompt: string;
  content: string;
  userId: string;
}): Promise<{ content: string; model: string; usage: DeepSeekResponse["usage"] }> {
  const config = await getAiConfig();
  if (!config.enabled || !config.apiKey) throw new AiProviderError("AI_DISABLED", 503);
  if (input.content.length > config.maxInputChars) throw new AiProviderError("AI_INPUT_TOO_LARGE", 413);

  const response = await fetchDeepSeek(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.defaultModel,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.content },
      ],
      thinking: { type: "disabled" },
      stream: false,
      max_tokens: Math.min(config.maxOutputTokens, 1_200),
      temperature: 0.4,
      user_id: input.userId,
    }),
    redirect: "error",
  }, config.timeoutMs);

  if (!response.ok) {
    if (response.status === 429) throw new AiProviderError("AI_RATE_LIMITED", 503);
    throw new AiProviderError("AI_PROVIDER_ERROR", 502);
  }
  const body = await response.json() as DeepSeekResponse;
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AiProviderError("AI_EMPTY_RESPONSE", 502);
  return { content: content.slice(0, 4_000), model: config.defaultModel, usage: body.usage };
}
