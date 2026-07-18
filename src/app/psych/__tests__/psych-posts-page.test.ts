import { describe, expect, it } from "vitest";
import { normalizePsychPost } from "../posts/page";

describe("心理区帖子页", () => {
  it("normalizes the API tag relation for PostCard", () => {
    const post = normalizePsychPost({
      id: "post-1",
      title: "匿名标题",
      summary: "匿名摘要",
      images: [],
      isAnonymous: true,
      anonymousId: "树洞-123",
      likeCount: 0,
      author: { id: "user-1", nickname: null, avatar: null },
      board: { name: "心理树洞", zone: "PSYCHOLOGY" },
      tags: [{ tag: { id: "tag-1", name: "情绪" } }],
    });

    expect(post.tags).toEqual([{ id: "tag-1", name: "情绪" }]);
    expect(post.board.zone).toBe("PSYCHOLOGY");
  });
});
