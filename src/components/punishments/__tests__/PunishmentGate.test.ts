import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PunishmentGate errors", () => {
  it("shows punishment status API errors instead of silently returning", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../PunishmentGate.tsx"), "utf8");

    expect(source).toContain('readApiErrorMessage(response, "账户状态获取失败")');
    expect(source).toContain("open={Boolean(hasBlockingNotice || loadError)}");
    expect(source).toContain('role="alert"');
    expect(source).not.toContain("if (!response?.ok) return");
  });
});
