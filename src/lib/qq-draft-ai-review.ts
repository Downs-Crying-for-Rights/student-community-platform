import "server-only";
import { requestDeepSeekReview } from "@/lib/ai/deepseek";
import { aiProviderUserId, containsUnredactedPii, redactForAi } from "@/lib/ai/redact";

export async function reviewQQDraftWithAi(payload: Record<string, unknown>, userId: string): Promise<string[]> {
  const redacted = redactForAi(payload);
  if (containsUnredactedPii(redacted.text)) return [];

  try {
    const { getAiPrompt } = await import("@/lib/ai/runtime-config");
    const { result } = await requestDeepSeekReview({
      systemPrompt: await getAiPrompt("QQ_DRAFT"),
      content: redacted.text,
      userId: aiProviderUserId(userId),
    });
    if (result.recommendation !== "NEED_MORE_INFO") return [];
    if (containsUnredactedPii(JSON.stringify(result.missingInformation))) return [];
    return result.missingInformation
      .filter((item) => !/https?:\/\//i.test(item))
      .slice(0, 6);
  } catch {
    // AI is advisory. Deterministic validation and later human review remain available.
    return [];
  }
}
