import { describe, expect, it } from "vitest";

import {
  canonicalizeQQDelegationDraft,
  hashQQDelegationDraft,
  validateQQDelegationDraft,
  type QQDelegationDraftInput,
} from "./qq-delegation";

const draft: QQDelegationDraftInput = {
  schemaVersion: 1,
  contentType: "TUTORING",
  schoolName: " Test School ",
  schoolCategory: "Public",
  schoolType: "High School",
  schoolAddress: "Test Road 1",
  reportChannels: "12345",
  description: "Weekend classes are required.",
  feeStatus: "none",
  demands: ["Stop classes", "Stop classes"],
  province: "Test Province",
  city: "Test City",
  riskPreference: "仅站内沟通",
};

describe("QQ delegation drafts", () => {
  it("validates and normalizes the canonical V1 shape", () => {
    const parsed = validateQQDelegationDraft(draft);

    expect(parsed.schoolName).toBe("Test School");
    expect(parsed.demands).toEqual(["Stop classes"]);
  });

  it("serializes fields in a stable order", () => {
    const canonical = canonicalizeQQDelegationDraft(draft);

    expect(canonical).toBe(canonicalizeQQDelegationDraft({ ...draft }));
    expect(JSON.parse(canonical)).toMatchObject({
      schemaVersion: 1,
      feeDetails: null,
      otherDemand: null,
    });
  });

  it("produces a stable payload hash", () => {
    expect(hashQQDelegationDraft(draft)).toBe(hashQQDelegationDraft({ ...draft }));
  });

  it("accepts the persisted JSON shape with null optional fields", () => {
    const persisted = JSON.parse(canonicalizeQQDelegationDraft(draft));

    expect(() => validateQQDelegationDraft(persisted)).not.toThrow();
    expect(hashQQDelegationDraft(persisted)).toBe(hashQQDelegationDraft(draft));
  });

  it("rejects unknown fields and incomplete charged-fee data", () => {
    expect(() => validateQQDelegationDraft({ ...draft, unexpected: true })).toThrow();
    expect(() =>
      validateQQDelegationDraft({ ...draft, feeStatus: "charged" }),
    ).toThrow("feeDetails is required");
  });
});
