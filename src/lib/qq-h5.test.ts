import { describe, expect, it } from "vitest";

import { maskQQIdentity } from "./qq-h5";

describe("QQ H5 identity presentation", () => {
  it("masks QQ identities without exposing the full value", () => {
    expect(maskQQIdentity("12345")).toBe("1***5");
    expect(maskQQIdentity("123456789")).toBe("12*****89");
    expect(maskQQIdentity("123456789012")).toBe("12******12");
  });
});
