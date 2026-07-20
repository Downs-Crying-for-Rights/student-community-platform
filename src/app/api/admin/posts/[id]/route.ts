import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { hasMinimumRole, withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, logAudit, AuditTargetType } from "@/lib/audit";
import { scanContent } from "@/lib/sensitive-engine";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "DELETED"]).optional(),
  title: z.string().min(1).max(30).optional(),
  content: z.string().min(1).max(10000).optional(),
  isPinned: z.boolean().optional(),
  reason: z.string().trim().min(1, "必须填写操作原因").max(500),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "请至少修改一项内容",
});

/**
 * PATCH /api/admin/posts/[id]
 * Change post status. MODERATOR+ only.
 * Used for: publish, reject, delete, restore posts.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.post.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, content: true, isPinned: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const { status, title, content, isPinned, reason } = parsed.data;
    if ((title !== undefined || content !== undefined) && !["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return NextResponse.json({ error: "只有管理员可以纠正帖子正文" }, { status: 403 });
    }
    if (isPinned !== undefined && !hasMinimumRole(req.user.role, "ADMIN")) {
      return NextResponse.json({ error: "只有管理员可以置顶帖子" }, { status: 403 });
    }
    if (isPinned === true && (status ?? existing.status) !== "PUBLISHED") {
      return NextResponse.json({ error: "只有已发布帖子可以置顶" }, { status: 400 });
    }
    if (title !== undefined || content !== undefined) {
      const matches = await scanContent(`${title ?? existing.title} ${content ?? existing.content}`);
      if (matches.length > 0) {
        return NextResponse.json({ error: "帖子内容包含敏感信息", matches }, { status: 400 });
      }
    }
    const updateData = {
      ...(status !== undefined ? { status: status as PostStatus } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(isPinned !== undefined ? { isPinned, pinnedAt: isPinned ? new Date() : null } : {}),
      ...(status !== undefined && status !== "PUBLISHED" ? { isPinned: false, pinnedAt: null } : {}),
    };

    const post = await prisma.$transaction(async (tx) => {
      if (title !== undefined || content !== undefined) {
        await tx.postEditHistory.create({
          data: { postId: id, oldTitle: existing.title, oldContent: existing.content },
        });
      }
      const updated = await tx.post.update({
        where: { id },
        data: updateData,
        include: {
        author: { select: { id: true, nickname: true, email: true } },
        board: { select: { id: true, name: true } },
        },
      });
      await logAudit(
        req.user.id,
        isPinned !== undefined
          ? AuditAction.POST_PIN_UPDATE
          : title !== undefined || content !== undefined
            ? AuditAction.ADMIN_POST_CORRECT
            : "ADMIN_UPDATE_POST_STATUS",
        AuditTargetType.POST,
        id,
        {
        oldStatus: existing.status,
        newStatus: status ?? existing.status,
        oldTitle: existing.title,
        newTitle: title ?? existing.title,
        updatedFields: Object.keys(updateData),
        reason,
        oldPinned: existing.isPinned,
        newPinned: isPinned ?? (status !== undefined && status !== "PUBLISHED" ? false : existing.isPinned),
        },
        undefined,
        tx,
      );
      return updated;
    });

    if (status === "PENDING" && existing.status !== "PENDING") {
      await sendAdminActionMail({
        minimumRole: "MODERATOR",
        subject: "帖子被重新加入审核队列",
        text: `帖子「${post.title}」由管理员重新设为待审核。`,
        actionUrl: "/admin/moderation",
      });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("PATCH /api/admin/posts/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
