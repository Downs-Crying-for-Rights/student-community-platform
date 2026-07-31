import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const QQ_BOT_COMMANDS = ["帮助", "绑定", "注册", "状态", "新建委托", "取消", "草稿"] as const;

const qqId = z.string().regex(/^[1-9]\d{4,11}$/);
const qqOfficialAppId = z.string().regex(/^\d{5,20}$/);
const qqOfficialOpenId = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);
const commandInput = z
  .object({
    type: z.literal("command"),
    command: z.enum(QQ_BOT_COMMANDS),
    argument: z.string().trim().min(1).max(256).optional(),
  })
  .strict();
const textInput = z
  .object({
    type: z.literal("text"),
    text: z.string().trim().min(1).max(10_000),
  })
  .strict();

const commonMessageFields = {
    version: z.literal(1),
    eventId: z.string().min(3).max(512),
    occurredAt: z.string().datetime({ offset: true }),
    input: z.discriminatedUnion("type", [commandInput, textInput]),
} as const;

const oneBotConversation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("private") }).strict(),
  z.object({ type: z.literal("group"), groupId: qqId }).strict(),
]);

export const qqBotMessageSchema = z
  .discriminatedUnion("platform", [
    z.object({ ...commonMessageFields, platform: z.literal("onebot11"), selfId: qqId, userId: qqId, conversation: oneBotConversation }).strict(),
    z.object({ ...commonMessageFields, platform: z.literal("qq_official"), selfId: qqOfficialAppId, userId: qqOfficialOpenId }).strict(),
  ])
  .superRefine((message, context) => {
    if (!message.eventId.startsWith(`${message.selfId}:`) || message.eventId.length === message.selfId.length + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventId"],
        message: "eventId must be scoped to selfId",
      });
    }
    if (message.input.type === "command" && message.input.argument && !["绑定", "注册"].includes(message.input.command)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["input", "argument"],
        message: "only binding and registration commands accept an argument",
      });
    }
  });

export type QQBotMessage = z.infer<typeof qqBotMessageSchema>;
export type QQBotIdentityProvider = "ONEBOT11" | "QQ_OFFICIAL";
export type QQBotConversationState = "idle" | "binding" | "delegation_form" | "draft";

export interface QQBotResponse {
  duplicate: boolean;
  replies: string[];
  conversation: {
    state: QQBotConversationState;
    revision: string;
    prompt: string | null;
  };
}

export function routeQQBotInput(text: string): QQBotMessage["input"] | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const [first, ...rest] = normalized.split(/\s+/u);
  if (first && (QQ_BOT_COMMANDS as readonly string[]).includes(first)) {
    const command = first as (typeof QQ_BOT_COMMANDS)[number];
    const argument = rest.join(" ");
    if ((command === "绑定" || command === "注册") && argument) return { type: "command", command, argument };
    if (!argument) return { type: "command", command };
  }
  return { type: "text", text: normalized };
}

export function qqBotIdentityProvider(platform: QQBotMessage["platform"]): QQBotIdentityProvider {
  return platform === "qq_official" ? "QQ_OFFICIAL" : "ONEBOT11";
}

export function isValidInternalBearer(header: string | null, expectedToken: string | undefined): boolean {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedDigest = createHash("sha256").update(expectedToken ?? "").digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return Boolean(expectedToken) && supplied.length > 0 && timingSafeEqual(expectedDigest, suppliedDigest);
}
