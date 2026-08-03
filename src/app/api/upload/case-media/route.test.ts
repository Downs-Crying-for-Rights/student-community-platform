import { describe, expect, it } from "vitest";

import { resolveMediaType } from "./route";

describe("case media type resolution", () => {
  it("accepts recorder MIME parameters", () => {
    const file = new File(["audio"], "recording.webm", { type: "audio/webm;codecs=opus" });
    expect(resolveMediaType(file)).toEqual({ extension: "webm", mimeType: "audio/webm" });
  });

  it("accepts mobile M4A and AAC variants", () => {
    expect(resolveMediaType(new File(["audio"], "voice.m4a", { type: "audio/x-m4a" }))).toEqual({ extension: "m4a", mimeType: "audio/x-m4a" });
    expect(resolveMediaType(new File(["audio"], "voice.aac", { type: "" }))).toEqual({ extension: "aac", mimeType: "audio/aac" });
  });
});
