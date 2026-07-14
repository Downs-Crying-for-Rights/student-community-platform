import { describe, expect, it } from "vitest";
import { isTerminalLogSource, redactTerminalOutput } from "@/lib/terminal-logs";

describe("terminal logs", () => {
  it("only accepts whitelisted sources", () => {
    expect(isTerminalLogSource("services")).toBe(true);
    expect(isTerminalLogSource("../../etc/passwd")).toBe(false);
  });

  it("redacts common credentials and control characters", () => {
    const result = redactTerminalOutput(
      "PASSWORD=hunter2 Authorization: Bearer abcdef token=qwerty sk-1234567890abcdef\u0000",
    );

    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("abcdef");
    expect(result).not.toContain("qwerty");
    expect(result).not.toContain("1234567890abcdef");
    expect(result).not.toContain("\u0000");
  });
});
