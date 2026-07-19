import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const QQ_BOT_COMMANDS = ["帮助", "绑定", "状态", "新建委托", "取消", "草稿"] as const;

const qqId = z.string().regex(/^[1-9]\d{4,11}$/);
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

export const qqBotMessageSchema = z
  .object({
    version: z.literal(1),
    eventId: z.string().min(3).max(200),
    platform: z.literal("onebot11"),
    selfId: qqId,
    userId: qqId,
    occurredAt: z.string().datetime({ offset: true }),
    input: z.discriminatedUnion("type", [commandInput, textInput]),
  })
  .strict()
  .superRefine((message, context) => {
    if (!message.eventId.startsWith(`${message.selfId}:`) || message.eventId.length === message.selfId.length + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventId"],
        message: "eventId must be scoped to selfId",
      });
    }
    if (message.input.type === "command" && message.input.argument && message.input.command !== "绑定") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["input", "argument"],
        message: "only the binding command accepts an argument",
      });
    }
  });

export type QQBotMessage = z.infer<typeof qqBotMessageSchema>;
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

export function isValidInternalBearer(header: string | null, expectedToken: string | undefined): boolean {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedDigest = createHash("sha256").update(expectedToken ?? "").digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return Boolean(expectedToken) && supplied.length > 0 && timingSafeEqual(expectedDigest, suppliedDigest);
}
