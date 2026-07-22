import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { isPhoneRequiredPageAllowed } from "../../middleware";

describe("phone binding page exception", () => {
  it("only accepts the exact binding path", () => {
    fc.assert(fc.property(fc.string(), (suffix) => {
      const path = `/bindphone${suffix}`;
      expect(isPhoneRequiredPageAllowed(path)).toBe(suffix === "");
    }));
  });
});
