import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { updatePostSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditTargetType } from "@/lib/audit";

/**
 * GET /api/posts/[id]
 * Get post detail by ID. Includes author, board, tags.
 * Checks that the post is not deleted/hidden (unless requester is author or moderator+).
 */
export const GET = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, nickname: true, avatar: true, isShadowBanned: true } },
        board: { select: { id: true, name: true, zone: true } },
        tags: { include: { tag: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const userId = req.user.id;
    const isAuthor = post.authorId === userId;
    const isModerator = hasMinimumRole(req.user.role, "MODERATOR");

    // Don't show DELETED posts unless moderator
    if (post.status === "DELETED" && !isModerator) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // PENDING posts only visible to author and moderator+
    if (post.status === "PENDING" && !isAuthor && !isModerator) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Shadow banned author's posts are only visible to the author themselves and moderators
    if (post.author.isShadowBanned && !isAuthor && !isModerator) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Strip isShadowBanned from response
    const { isShadowBanned: _, ...authorData } = post.author;

    return NextResponse.json({ post: { ...post, author: authorData } });
  } catch (error) {
    console.error("GET /api/posts/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});


/**
 * PATCH /api/posts/[id]
 * Edit own post only. Validates with updatePostSchema.
 * Saves PostEditHistory before updating. Re-runs sensitive scan.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, title: true, content: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (existing.authorId !== req.user.id) {
      return NextResponse.json({ error: "只能编辑自己的帖子" }, { status: 403 });
    }

    if (existing.status === "DELETED") {
      return NextResponse.json({ error: "已删除的帖子无法编辑" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updatePostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { title, content, summary, tagIds, images, visibility } = parsed.data;

    // Sensitive word scan on updated content
    const newTitle = title ?? existing.title;
    const newContent = content ?? existing.content;
    const textToScan = `${newTitle} ${newContent}`;
    const matches = await scanContent(textToScan);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "内容包含敏感词", matches },
        { status: 400 },
      );
    }

    // Save edit history before updating
    await prisma.postEditHistory.create({
      data: {
        postId: id,
        oldTitle: existing.title,
        oldContent: existing.content,
      },
    });

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (summary !== undefined) updateData.summary = summary;
    if (images !== undefined) updateData.images = images;
    if (visibility !== undefined) updateData.visibility = visibility;

    // Handle tag updates
    if (tagIds !== undefined) {
      // Delete existing tags and recreate
      await prisma.postTag.deleteMany({ where: { postId: id } });
      if (tagIds.length > 0) {
        await prisma.postTag.createMany({
          data: tagIds.map((tagId) => ({ postId: id, tagId })),
        });
      }
    }

    const post = await prisma.post.update({
      where: { id },
      data: updateData,
      include: {
        author: { select: { id: true, nickname: true, avatar: true } },
        board: { select: { id: true, name: true, zone: true } },
        tags: { include: { tag: true } },
      },
    });

    await logAudit(
      req.user.id,
      "EDIT_POST",
      AuditTargetType.POST,
      id,
      { updatedFields: Object.keys(updateData) },
    );

    return NextResponse.json({ post });
  } catch (error) {
    console.error("PATCH /api/posts/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * DELETE /api/posts/[id]
 * Soft delete: sets status to DELETED.
 * Author can delete own post. Moderator+ can delete any post.
 */
export const DELETE = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (existing.status === "DELETED") {
      return NextResponse.json({ error: "帖子已被删除" }, { status: 400 });
    }

    const isAuthor = existing.authorId === req.user.id;
    const isModerator = hasMinimumRole(req.user.role, "MODERATOR");

    if (!isAuthor && !isModerator) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    await prisma.post.update({
      where: { id },
      data: { status: "DELETED" },
    });

    await logAudit(
      req.user.id,
      "DELETE_POST",
      AuditTargetType.POST,
      id,
      { deletedBy: isAuthor ? "author" : "moderator" },
    );

    return NextResponse.json({ message: "帖子已删除" });
  } catch (error) {
    console.error("DELETE /api/posts/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
