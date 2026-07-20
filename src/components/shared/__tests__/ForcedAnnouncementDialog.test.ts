import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { announcementStorageKey } from "@/lib/announcement";

describe("ForcedAnnouncementDialog", () => {
  it("uses announcement id and revision for anonymous dismissal", () => {
    expect(announcementStorageKey("a1", 3)).toBe("forced-announcement:a1:3");
  });

  it("cannot close without explicit acknowledgement", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../ForcedAnnouncementDialog.tsx"), "utf8");
    expect(source).toContain("showCloseButton={false}");
    expect(source).toContain("onInteractOutside={(event) => event.preventDefault()}");
    expect(source).toContain("onEscapeKeyDown={(event) => event.preventDefault()}");
    expect(source).toContain("我已阅读并确认");
  });
});
