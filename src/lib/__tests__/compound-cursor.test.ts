import { describe, expect, it } from "vitest";
import { cursorWhere, encodeCompoundCursor, parseCompoundCursor } from "@/lib/compound-cursor";

describe("compound cursor", () => {
  const row = { id: "message-2", createdAt: new Date("2026-07-22T10:00:00.000Z") };

  it("round-trips a stable scoped cursor", () => {
    const encoded = encodeCompoundCursor("dm:thread-1", "older", row);
    expect(parseCompoundCursor(encoded, "dm:thread-1", "older")).toEqual(row);
  });

  it("rejects malformed, foreign, and mixed-direction cursors", () => {
    const encoded = encodeCompoundCursor("chat-room:one", "older", row);
    expect(parseCompoundCursor("not-base64-json", "chat-room:one", "older")).toBeNull();
    expect(parseCompoundCursor(encoded, "chat-room:two", "older")).toBeNull();
    expect(parseCompoundCursor(encoded, "chat-room:one", "newer")).toBeNull();
  });

  it("uses id as the deterministic tie-breaker", () => {
    expect(cursorWhere(row, "older")).toEqual({
      OR: [
        { createdAt: { lt: row.createdAt } },
        { createdAt: row.createdAt, id: { lt: row.id } },
      ],
    });
    expect(cursorWhere(row, "newer", "updatedAt")).toEqual({
      OR: [
        { updatedAt: { gt: row.createdAt } },
        { updatedAt: row.createdAt, id: { gt: row.id } },
      ],
    });
  });
});
