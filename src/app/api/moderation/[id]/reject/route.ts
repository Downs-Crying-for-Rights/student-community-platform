import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const rejectSchema = z.object({
  reason: z.string().min(1, "拒绝原因不能为空").max(1000, "拒绝原因不能超过 1000 个字符"),
});

/**
 * POST /api/moderation/[id]/reject
 * Moderator+ only: reject a PENDING post, changing its status to REJECTED.
 * - Requires a rejection reason
 * - Creates a notification for the post author with the rejection reason
 * - Records the action to AuditLog
 */
export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { id } = context.params;

    const body = await req.json();
    const parsed = rejectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { reason } = parsed.data;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status !== "PENDING") {
      return NextResponse.json(
        { error: "只能审核待审核状态的帖子", detail: `当前状态: ${post.status}` },
        { status: 400 },
      );
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    // Create notification for the post author with rejection reason
    await prisma.notification.create({
      data: {
        type: "SYSTEM",
        title: "帖子审核未通过",
        content: `您的帖子「${post.title}」未通过审核，原因：${reason}`,
        userId: post.authorId,
        link: `/post/${post.id}`,
      },
    });

    // Record to AuditLog
    await logAudit(
      req.user.id,
      AuditAction.CONTENT_REJECT,
      AuditTargetType.POST,
      id,
      { previousStatus: "PENDING", newStatus: "REJECTED", title: post.title, reason },
    );

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    console.error("POST /api/moderation/[id]/reject error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
