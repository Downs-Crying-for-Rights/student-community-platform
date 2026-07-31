import { COMMANDS, type RoutedInput } from "./types.js";

export function routeInput(text: string): RoutedInput {
  const normalized = text.trim();
  const [first, ...rest] = normalized.split(/\s+/u);

  if (first && (COMMANDS as readonly string[]).includes(first)) {
    const command = first as (typeof COMMANDS)[number];
    const argument = rest.join(" ");
    if ((command === "绑定" || command === "注册") && argument) return { type: "command", command, argument };
    if (!argument) return { type: "command", command };
  }

  return { type: "text", text: normalized };
}

export function extractText(message: unknown, rawMessage?: string): string | null {
  if (Array.isArray(message)) {
    const text = message
      .filter((segment): segment is { type: "text"; data: { text: string } } => {
        if (!segment || typeof segment !== "object") return false;
        const candidate = segment as { type?: unknown; data?: { text?: unknown } };
        return candidate.type === "text" && typeof candidate.data?.text === "string";
      })
      .map((segment) => segment.data.text)
      .join("")
      .trim();
    return text || null;
  }

  const source = typeof message === "string" ? message : rawMessage;
  if (typeof source !== "string") return null;
  const text = source.replace(/\[CQ:[^\]]*\]/gu, "").trim();
  return text || null;
}

export function extractMentionedText(message: unknown, selfId: string, rawMessage?: string): string | null {
  if (Array.isArray(message)) {
    const mentioned = message.some((segment) => {
      if (!segment || typeof segment !== "object") return false;
      const candidate = segment as { type?: unknown; data?: { qq?: unknown } };
      return candidate.type === "at" && String(candidate.data?.qq ?? "") === selfId;
    });
    return mentioned ? extractText(message, rawMessage) : null;
  }
  const source = typeof message === "string" ? message : rawMessage;
  if (typeof source !== "string") return null;
  const escapedSelfId = selfId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\[CQ:at,(?:[^\\]]*,)?qq=${escapedSelfId}(?:,[^\\]]*)?\\]`, "u").test(source)) return null;
  return extractText(source);
}
