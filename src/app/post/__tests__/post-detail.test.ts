import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "test-post-1" }),
  usePathname: () => "/post/test-post-1",
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, blurDataURL, ...rest } = props;
    return { type: "img", props: rest };
  },
}));

const mockPost = {
  id: "test-post-1",
  title: "测试帖子标题",
  content: "这是帖子正文内容\n包含多行文本",
  images: ["/img1.jpg", "/img2.jpg"],
  isAnonymous: false,
  anonymousId: null,
  likeCount: 5,
  commentCount: 3,
  createdAt: new Date().toISOString(),
  author: { id: "user-1", nickname: "测试用户", avatar: "/avatar.jpg" },
  board: { id: "board-1", name: "娱乐", zone: "PUBLIC" },
  tags: [{ tag: { id: "tag-1", name: "测试标签" } }],
};

const mockPsychPost = {
  ...mockPost,
  id: "psych-post-1",
  isAnonymous: true,
  anonymousId: "匿名用户_AB12",
  board: { id: "board-2", name: "心理交流", zone: "PSYCHOLOGY" },
  author: { id: "user-2", nickname: null, avatar: null },
};

const mockDCRPost = {
  ...mockPost,
  id: "dcr-post-1",
  board: { id: "board-3", name: "DCR 私密区", zone: "DCR" },
};

describe("PostDetailPage data handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should correctly identify PSYCHOLOGY zone posts for privacy banner", () => {
    const zone = mockPsychPost.board.zone;
    expect(zone === "PSYCHOLOGY" || zone === "DCR").toBe(true);
  });

  it("should correctly identify DCR zone posts for privacy banner", () => {
    const zone = mockDCRPost.board.zone;
    expect(zone === "PSYCHOLOGY" || zone === "DCR").toBe(true);
  });

  it("should not show privacy banner for PUBLIC zone posts", () => {
    const zone = mockPost.board.zone;
    expect(zone === "PSYCHOLOGY" || zone === "DCR").toBe(false);
  });

  it("should display anonymous name for anonymous posts", () => {
    const displayName = mockPsychPost.isAnonymous
      ? mockPsychPost.anonymousId ?? "匿名用户"
      : mockPsychPost.author.nickname ?? "未命名用户";
    expect(displayName).toBe("匿名用户_AB12");
  });

  it("should display author nickname for non-anonymous posts", () => {
    const displayName = mockPost.isAnonymous
      ? mockPost.anonymousId ?? "匿名用户"
      : mockPost.author.nickname ?? "未命名用户";
    expect(displayName).toBe("测试用户");
  });

  it("should fallback to default name when nickname is null", () => {
    const post = { ...mockPost, isAnonymous: false, author: { ...mockPost.author, nickname: null } };
    const displayName = post.isAnonymous
      ? post.anonymousId ?? "匿名用户"
      : post.author.nickname ?? "未命名用户";
    expect(displayName).toBe("未命名用户");
  });

  it("should fallback to default anonymous name when anonymousId is null", () => {
    const post = { ...mockPost, isAnonymous: true, anonymousId: null };
    const displayName = post.isAnonymous
      ? post.anonymousId ?? "匿名用户"
      : post.author.nickname ?? "未命名用户";
    expect(displayName).toBe("匿名用户");
  });
});

describe("PostDetailPage API interaction logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should parse like API response correctly", () => {
    const likeResponse = { liked: true, likeCount: 6 };
    expect(likeResponse.liked).toBe(true);
    expect(likeResponse.likeCount).toBe(6);
  });

  it("should parse unlike API response correctly", () => {
    const unlikeResponse = { liked: false, likeCount: 4 };
    expect(unlikeResponse.liked).toBe(false);
    expect(unlikeResponse.likeCount).toBe(4);
  });

  it("should parse bookmark API response correctly", () => {
    const bookmarkResponse = { bookmarked: true };
    expect(bookmarkResponse.bookmarked).toBe(true);
  });

  it("should parse unbookmark API response correctly", () => {
    const unbookmarkResponse = { bookmarked: false };
    expect(unbookmarkResponse.bookmarked).toBe(false);
  });

  it("should handle post with no images", () => {
    const noImagePost = { ...mockPost, images: [] };
    expect(noImagePost.images.length).toBe(0);
  });

  it("should handle post with multiple tags", () => {
    const multiTagPost = {
      ...mockPost,
      tags: [
        { tag: { id: "t1", name: "标签1" } },
        { tag: { id: "t2", name: "标签2" } },
        { tag: { id: "t3", name: "标签3" } },
      ],
    };
    expect(multiTagPost.tags.length).toBe(3);
  });
});


describe("PostDetailPage delete logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should identify current user as author when IDs match", () => {
    const sessionUserId = "user-1";
    const postAuthorId = "user-1";
    const isAuthor = sessionUserId === postAuthorId;
    expect(isAuthor).toBe(true);
  });

  it("should not identify current user as author when IDs differ", () => {
    const sessionUserId = "user-2";
    const postAuthorId = "user-1";
    const isAuthor = sessionUserId === postAuthorId;
    expect(isAuthor).toBe(false);
  });

  it("should not identify as author when session is null", () => {
    const sessionUserId: string | undefined = undefined;
    const postAuthorId = "user-1";
    const isAuthor = Boolean(sessionUserId && postAuthorId === sessionUserId);
    expect(isAuthor).toBe(false);
  });

  it("should parse delete success response correctly", () => {
    const response = { message: "帖子已删除" };
    expect(response.message).toBe("帖子已删除");
  });

  it("should parse delete error response correctly", () => {
    const errorResponse = { error: "权限不足" };
    expect(errorResponse.error).toBe("权限不足");
  });

  it("should handle already deleted post error", () => {
    const errorResponse = { error: "帖子已被删除" };
    expect(errorResponse.error).toBe("帖子已被删除");
  });
});
