import { createHash } from "node:crypto";
import { z } from "zod";

const trimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const QQ_DELEGATION_SCHEMA_VERSION = 1 as const;

export const qqDelegationDraftSchema = z
  .object({
    schemaVersion: z.literal(QQ_DELEGATION_SCHEMA_VERSION),
    contentType: z.enum([
      "TUTORING",
      "EARLY_START",
      "NO_WEEKENDS",
      "EXTERNAL_TRAINING",
      "OTHER",
    ]),
    schoolName: trimmedString(200),
    schoolCategory: trimmedString(100),
    schoolType: trimmedString(100),
    schoolAddress: trimmedString(500),
    reportChannels: optionalText(500),
    description: trimmedString(10_000),
    feeStatus: z.enum(["none", "charged", "unknown"]),
    feeDetails: optionalText(1_000),
    demands: z.array(trimmedString(200)).min(1).max(20),
    otherDemand: optionalText(1_000),
    grade: optionalText(20),
    timeRange: optionalText(200),
    province: trimmedString(50),
    city: trimmedString(50),
    expectedHelperProvince: optionalText(50),
    riskPreference: z.enum(["仅站内沟通", "可电话", "仅模板咨询"]),
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.feeStatus === "charged" && !draft.feeDetails) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feeDetails"],
        message: "feeDetails is required when feeStatus is charged",
      });
    }
  })
  .transform((draft) => ({
    ...draft,
    demands: [...new Set(draft.demands)],
  }));

export type QQDelegationDraft = z.infer<typeof qqDelegationDraftSchema>;
export type QQDelegationDraftInput = z.input<typeof qqDelegationDraftSchema>;

export function validateQQDelegationDraft(input: unknown): QQDelegationDraft {
  return qqDelegationDraftSchema.parse(input);
}

export function canonicalizeQQDelegationDraft(input: unknown): string {
  const draft = validateQQDelegationDraft(input);
  return JSON.stringify({
    schemaVersion: draft.schemaVersion,
    contentType: draft.contentType,
    schoolName: draft.schoolName,
    schoolCategory: draft.schoolCategory,
    schoolType: draft.schoolType,
    schoolAddress: draft.schoolAddress,
    reportChannels: draft.reportChannels ?? null,
    description: draft.description,
    feeStatus: draft.feeStatus,
    feeDetails: draft.feeDetails ?? null,
    demands: draft.demands,
    otherDemand: draft.otherDemand ?? null,
    grade: draft.grade ?? null,
    timeRange: draft.timeRange ?? null,
    province: draft.province,
    city: draft.city,
    expectedHelperProvince: draft.expectedHelperProvince ?? null,
    riskPreference: draft.riskPreference,
  });
}

export function hashQQDelegationDraft(input: unknown): string {
  return createHash("sha256")
    .update(canonicalizeQQDelegationDraft(input), "utf8")
    .digest("base64url");
}
