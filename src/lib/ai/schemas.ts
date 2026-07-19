import { z } from "zod";

export const aiReviewTargetSchema = z.enum([
  "POST",
  "POST_REVISION",
  "REPORT",
  "CASE",
  "DISPUTE",
  "CHAT_ROOM",
]);

export type AiReviewTarget = z.infer<typeof aiReviewTargetSchema>;

export const aiReviewResultSchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  confidence: z.number().min(0).max(1),
  recommendation: z.enum(["APPROVE", "REJECT", "NEED_MORE_INFO", "MANUAL_REVIEW"]),
  categories: z.array(z.enum([
    "PII", "HARASSMENT", "THREAT", "SELF_HARM", "PHISHING", "SEXUAL",
    "ILLEGAL", "SPAM", "MISINFORMATION", "PRIVACY", "OTHER",
  ])).max(12),
  summary: z.string().trim().min(1).max(800),
  reasons: z.array(z.string().trim().min(1).max(500)).max(8),
  evidence: z.array(z.object({
    field: z.string().trim().min(1).max(80),
    quote: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(80),
  })).max(8),
  missingInformation: z.array(z.string().trim().min(1).max(300)).max(10),
  suggestedReason: z.string().trim().max(1000),
  requiresHumanReview: z.boolean(),
}).strict();

export type AiReviewResult = z.infer<typeof aiReviewResultSchema>;
