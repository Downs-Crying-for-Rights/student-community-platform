import { describe, it, expect, vi, beforeEach } from "vitest";

const mockNotificationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
  },
}));

import { createNotification } from "../notification";

describe("createNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应创建带链接的通知", async () => {
    const mockResult = {
      id: "n1",
      userId: "user1",
      type: "COMMENT",
      title: "新评论",
      content: "有人评论了你的帖子",
      link: "/post/p1",
      isRead: false,
      createdAt: new Date(),
    };
    mockNotificationCreate.mockResolvedValue(mockResult);

    const result = await createNotification(
      "user1",
      "COMMENT",
      "新评论",
      "有人评论了你的帖子",
      "/post/p1",
    );

    expect(result).toEqual(mockResult);
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user1",
        type: "COMMENT",
        title: "新评论",
        content: "有人评论了你的帖子",
        link: "/post/p1",
      },
    });
  });

  it("应创建不带链接的通知（link 为 null）", async () => {
    const mockResult = {
      id: "n2",
      userId: "user1",
      type: "SYSTEM",
      title: "系统通知",
      content: "欢迎加入社区",
      link: null,
      isRead: false,
      createdAt: new Date(),
    };
    mockNotificationCreate.mockResolvedValue(mockResult);

    const result = await createNotification(
      "user1",
      "SYSTEM",
      "系统通知",
      "欢迎加入社区",
    );

    expect(result).toEqual(mockResult);
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: "user1",
        type: "SYSTEM",
        title: "系统通知",
        content: "欢迎加入社区",
        link: null,
      },
    });
  });

  it("应支持所有通知类型", async () => {
    const types = [
      "COMMENT",
      "LIKE",
      "REPORT_RESULT",
      "CASE_UPDATE",
      "DCR_ACCESS",
      "PSYCH_MATCH",
      "SYSTEM",
    ] as const;

    for (const type of types) {
      mockNotificationCreate.mockResolvedValue({ id: `n-${type}`, type });
      await createNotification("user1", type, `${type} title`, `${type} content`);
      expect(mockNotificationCreate).toHaveBeenLastCalledWith({
        data: {
          userId: "user1",
          type,
          title: `${type} title`,
          content: `${type} content`,
          link: null,
        },
      });
    }
  });
});
