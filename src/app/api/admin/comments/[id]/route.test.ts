import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  postUpdate: vi.fn(),
  notificationCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: {
    comment: { findUnique: mocks.findUnique },
    $transaction: (callback: (tx: unknown) => unknown) => callback({
      comment: { updateMany: mocks.updateMany },
      post: { update: mocks.postUpdate },
      notification: { create: mocks.notificationCreate },
    }),
  },
}));
vi.mock("@/lib/audit", () => ({
  AuditTargetType: { COMMENT: "COMMENT" },
  logAudit: mocks.audit,
}));

import { PATCH } from "./route";

describe("PATCH /api/admin/comments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findUnique.mockResolvedValue({
      id: "comment-1",
      isDeleted: false,
      postId: "post-1",
      authorId: "admin-1",
      content: "评论内容",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("notifies the author with the moderation reason even when the author is the administrator", async () => {
    const response = await PATCH(new NextRequest("http://localhost/api/admin/comments/comment-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDeleted: true, reason: "违反社区规则" }),
    }), { params: { id: "comment-1" } });

    expect(response.status).toBe(200);
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        title: "评论已被删除",
        content: expect.stringContaining("违反社区规则"),
      }),
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      "admin-1",
      "ADMIN_DELETE_COMMENT",
      "COMMENT",
      "comment-1",
      { postId: "post-1", reason: "违反社区规则" },
    );
  });
});
