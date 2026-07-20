import { describe, expect, it } from "vitest";

import { canCreateDcrPost, canSubmitDcrDelegation, canUseDcrWorkspace } from "@/lib/dcr-capabilities";

describe("DCR contribution capabilities", () => {
  it("allows contribution invites to post and submit without workspace access", () => {
    const user = {
      role: "USER",
      dcrAccess: false,
      dcrPledgeSigned: false,
      dcrContributionAccess: true,
    };
    expect(canCreateDcrPost(user)).toBe(true);
    expect(canSubmitDcrDelegation(user)).toBe(true);
    expect(canUseDcrWorkspace(user)).toBe(false);
  });

  it("keeps ordinary users outside contribution actions", () => {
    const user = {
      role: "USER",
      dcrAccess: false,
      dcrPledgeSigned: false,
      dcrContributionAccess: false,
    };
    expect(canCreateDcrPost(user)).toBe(false);
    expect(canSubmitDcrDelegation(user)).toBe(false);
  });

  it("requires the pledge for a non-admin workspace user", () => {
    expect(canUseDcrWorkspace({
      role: "USER",
      dcrAccess: true,
      dcrPledgeSigned: false,
      dcrContributionAccess: false,
    })).toBe(false);
  });
});
