import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { getSessionActions } from "../[id]/page";

describe("task session actions", () => {
  it("restores the correct controls for each active session state", () => {
    expect(getSessionActions("CLAIMED", true, true)).toMatchObject({ canStart: true, canDispute: true });
    expect(getSessionActions("IN_PROGRESS", true, false)).toMatchObject({ canRequestClose: true, canDispute: true });
    expect(getSessionActions("EVIDENCE_PENDING", true, false)).toMatchObject({ canConfirmClose: true, canDispute: true });
    expect(getSessionActions("DISPUTED", true, true)).toMatchObject({
      canStart: false, canRequestClose: false, canConfirmClose: false, canDispute: false,
    });
  });

  it("sends a concrete session id for close and dispute operations", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../[id]/page.tsx"), "utf8");
    expect(source).toContain("JSON.stringify({ action, sessionId })");
    expect(source).toContain("JSON.stringify({ explanation: explanation.trim(), sessionId })");
  });
});
