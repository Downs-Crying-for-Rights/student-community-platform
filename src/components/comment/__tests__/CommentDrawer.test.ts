import { describe, it, expect } from "vitest";
import {
  getDisplayName,
  flattenComments,
  type CommentData,
} from "../CommentDrawer";

// ---------- Helper factories ----------

function makeComment(overrides: Partial<CommentData> = {}): CommentData {
  return {
    id: "c1",
    content: "hello",
    createdAt: new Date().toISOString(),
    author: { id: "u1", nickname: "Alice", avatar: null },
    replies: [],
    ...overrides,
  };
}

// ---------- getDisplayName ----------

describe("getDisplayName", () => {
  it("returns nickname when not anonymous", () => {
    const c = makeComment({ author: { id: "u1", nickname: "Bob", avatar: null } });
    expect(getDisplayName(c)).toBe("Bob");
  });

  it("returns '未命名用户' when nickname is null and not anonymous", () => {
    const c = makeComment({ author: { id: "u1", nickname: null, avatar: null } });
    expect(getDisplayName(c)).toBe("未命名用户");
  });

  it("returns anonymousId when anonymous", () => {
    const c = makeComment({
      isAnonymous: true,
      anonymousId: "匿名用户_AB12",
    });
    expect(getDisplayName(c)).toBe("匿名用户_AB12");
  });

  it("returns '匿名用户' when anonymous but anonymousId is null", () => {
    const c = makeComment({
      isAnonymous: true,
      anonymousId: null,
    });
    expect(getDisplayName(c)).toBe("匿名用户");
  });

  it("returns '匿名用户' when anonymous and anonymousId is undefined", () => {
    const c = makeComment({ isAnonymous: true });
    expect(getDisplayName(c)).toBe("匿名用户");
  });
});

// ---------- flattenComments ----------

describe("flattenComments", () => {
  it("returns empty array for empty input", () => {
    expect(flattenComments([])).toEqual([]);
  });

  it("preserves top-level comments without replies", () => {
    const comments = [makeComment({ id: "c1" }), makeComment({ id: "c2" })];
    const result = flattenComments(comments);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("c1");
    expect(result[1].id).toBe("c2");
  });

  it("keeps first-level replies as-is", () => {
    const reply = makeComment({ id: "r1" });
    const parent = makeComment({ id: "c1", replies: [reply] });
    const result = flattenComments([parent]);

    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies![0].id).toBe("r1");
  });

  it("flattens second-level replies into first level", () => {
    const deepReply = makeComment({ id: "rr1", content: "deep" });
    const reply = makeComment({ id: "r1", replies: [deepReply] });
    const parent = makeComment({ id: "c1", replies: [reply] });

    const result = flattenComments([parent]);

    // r1 and rr1 should both appear in parent's replies
    expect(result[0].replies).toHaveLength(2);
    expect(result[0].replies![0].id).toBe("r1");
    expect(result[0].replies![1].id).toBe("rr1");
  });

  it("flattens multiple second-level replies correctly", () => {
    const deep1 = makeComment({ id: "rr1" });
    const deep2 = makeComment({ id: "rr2" });
    const reply1 = makeComment({ id: "r1", replies: [deep1, deep2] });
    const reply2 = makeComment({ id: "r2", replies: [] });
    const parent = makeComment({ id: "c1", replies: [reply1, reply2] });

    const result = flattenComments([parent]);

    // r1, rr1, rr2, r2
    expect(result[0].replies).toHaveLength(4);
    expect(result[0].replies!.map((r) => r.id)).toEqual([
      "r1",
      "rr1",
      "rr2",
      "r2",
    ]);
  });

  it("clears replies on flattened deep comments", () => {
    const deepReply = makeComment({
      id: "rr1",
      replies: [makeComment({ id: "rrr1" })],
    });
    const reply = makeComment({ id: "r1", replies: [deepReply] });
    const parent = makeComment({ id: "c1", replies: [reply] });

    const result = flattenComments([parent]);
    const flattenedDeep = result[0].replies!.find((r) => r.id === "rr1");
    expect(flattenedDeep?.replies).toEqual([]);
  });
});
