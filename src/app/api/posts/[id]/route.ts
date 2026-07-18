import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, withOptionalAuth, hasMinimumRole, type AuthenticatedRequest, type OptionalAuthRequest } from "@/lib/rbac";
import { updatePostSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { anonymizePsychologyPost, checkPostAccess } from "@/lib/post-access";

/**
 * GET /api/posts/[id]
 * Get post detail by ID. Public endpoint (no login required).
 * Includes author, board, tags.
 * Unauthenticated users can only view PUBLISHED posts in the PUBLIC zone.
 * Checks that the post is not deleted/hidden (unless requester is author or moderator+).
 */
export const GET = withOptionalAuth(async (
  req: OptionalAuthRequest,
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
        case_: { select: { id: true, category: true, status: true, requestStatus: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Unauthenticated users: only allow PUBLISHED posts in PUBLIC zone
    if (!req.user) {
      if (post.status !== "PUBLISHED" || post.board.zone !== "PUBLIC" || post.visibility !== "PUBLIC") {
        return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
      }
      if (post.author.isShadowBanned) {
        return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
      }
      const { isShadowBanned: _, ...authorData } = post.author;
      return NextResponse.json({ post: { ...post, author: authorData } });
    }

    const userId = req.user.id;
    const isAuthor = post.authorId === userId;
    const isModerator = hasMinimumRole(req.user.role, "MODERATOR");

    const access = await checkPostAccess(req.user, post);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (post.board.zone === "DCR" && post.case_ && post.case_.requestStatus !== "APPROVED" && !isAuthor && !isModerator) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

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

    return NextResponse.json({
      post: {
        ...anonymizePsychologyPost({ ...post, author: authorData }),
        isAuthor,
      },
    });
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
      select: {
        id: true, authorId: true, title: true, content: true, summary: true, images: true,
        status: true, visibility: true, updatedAt: true,
        tags: { select: { tagId: true } },
        board: { select: { zone: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (existing.authorId !== req.user.id) {
      return NextResponse.json({ error: "只能编辑自己的帖子" }, { status: 403 });
    }

    const access = await checkPostAccess(req.user, existing);
    if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

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

    if (existing.board.zone === "PSYCHOLOGY" && visibility === "MATCHED") {
      return NextResponse.json({ error: "心理区暂不支持匹配可见帖子" }, { status: 400 });
    }

    // Sensitive word scan on updated content
    const newTitle = title ?? existing.title;
    const newContent = content ?? existing.content;
    const textToScan = `${newTitle} ${newContent} ${summary ?? ""}`;
    const matches = await scanContent(textToScan);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "内容包含敏感词", matches },
        { status: 400 },
      );
    }

    const nextTagIds = tagIds ?? (existing.tags ?? []).map((item) => item.tagId);
    if (nextTagIds.length > 0) {
      const validTagCount = await prisma.tag.count({ where: { id: { in: nextTagIds } } });
      if (validTagCount !== new Set(nextTagIds).size) {
        return NextResponse.json({ error: "包含不存在的标签" }, { status: 400 });
      }
    }

    const proposed = {
      title: title ?? existing.title,
      content: content ?? existing.content,
      summary: summary !== undefined ? summary : existing.summary,
      images: images ?? existing.images ?? [],
      visibility: visibility ?? existing.visibility,
      tagIds: [...new Set(nextTagIds)],
    };

    if (existing.status === "PUBLISHED") {
      const revision = await prisma.$transaction(async (tx) => {
        await tx.postRevision.updateMany({
          where: { postId: id, status: "PENDING" },
          data: { status: "SUPERSEDED", reviewedAt: new Date() },
        });
        const created = await tx.postRevision.create({
          data: { ...proposed, postId: id, editorId: req.user.id, baseUpdatedAt: existing.updatedAt ?? new Date(0) },
        });
        await logAudit(req.user.id, "POST_REVISION_SUBMIT", AuditTargetType.POST, id, {
          revisionId: created.id,
          baseUpdatedAt: (existing.updatedAt ?? new Date(0)).toISOString(),
        }, undefined, tx);
        return created;
      });
      return NextResponse.json({
        post: { ...existing, isAuthor: true, pendingRevision: revision },
        liveVersionUnchanged: true,
        reviewStatus: "PENDING",
      });
    }

    const post = await prisma.$transaction(async (tx) => {
      await tx.postEditHistory.create({ data: { postId: id, oldTitle: existing.title, oldContent: existing.content } });
      await tx.postTag.deleteMany({ where: { postId: id } });
      if (proposed.tagIds.length > 0) {
        await tx.postTag.createMany({ data: proposed.tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
      const { tagIds: _tagIds, ...postData } = proposed;
      const updated = await tx.post.update({
        where: { id },
        data: { ...postData, status: "PENDING" },
        include: {
          author: { select: { id: true, nickname: true, avatar: true } },
          board: { select: { id: true, name: true, zone: true } },
          tags: { include: { tag: true } },
        },
      });
      await logAudit(req.user.id, "POST_REVISION_SUBMIT", AuditTargetType.POST, id, {
        oldStatus: existing.status,
        newStatus: "PENDING",
      }, undefined, tx);
      return updated;
    });

    return NextResponse.json({ post: { ...anonymizePsychologyPost(post), isAuthor: true }, liveVersionUnchanged: false, reviewStatus: "PENDING" });
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
      select: { id: true, authorId: true, status: true, visibility: true, board: { select: { zone: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (existing.status === "DELETED") {
      return NextResponse.json({ error: "帖子已被删除" }, { status: 400 });
    }

    const isAuthor = existing.authorId === req.user.id;
    const isModerator = hasMinimumRole(req.user.role, "MODERATOR");

    if (existing.board.zone === "PSYCHOLOGY") {
      const access = await checkPostAccess(req.user, existing);
      if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
    }

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
