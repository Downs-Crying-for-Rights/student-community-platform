import { describe, expect, it } from "vitest";
import { hasEffectiveDcrAccess } from "@/lib/dcr-access-status";

describe("hasEffectiveDcrAccess", () => {
  it("申请状态已通过但权限写入失败时不应误判为已准入", () => {
    expect(hasEffectiveDcrAccess(false, false, "APPROVED")).toBe(false);
  });

  it("实时进度已授予权限时，即使 Session 尚未刷新也允许进入", () => {
    expect(hasEffectiveDcrAccess(false, true, "PENDING")).toBe(true);
  });

  it("待审核且未授予权限时保持未过审", () => {
    expect(hasEffectiveDcrAccess(false, false, "PENDING")).toBe(false);
  });
});
