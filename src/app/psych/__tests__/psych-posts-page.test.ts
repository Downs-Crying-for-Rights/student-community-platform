import { describe, expect, it } from "vitest";
import {
  buildPsychPostsUrl,
  getPsychPostingGuidelines,
  normalizePsychPost,
} from "../posts/page";

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

  it("builds psychology-zone pagination and board filters", () => {
    expect(buildPsychPostsUrl({ page: 2, boardId: "board-1", sort: "popular" })).toContain(
      "zone=PSYCHOLOGY&page=2&pageSize=12&sort=popular&boardId=board-1",
    );
  });

  it("publishes clear peer-support and privacy boundaries", () => {
    const text = getPsychPostingGuidelines().map((item) => `${item.title}${item.description}`).join(" ");
    expect(text).toContain("不诊断");
    expect(text).toContain("隐私");
    expect(text).toContain("12356");
  });
});
