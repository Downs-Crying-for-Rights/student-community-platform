import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditTargetType } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "DELETED"]),
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
      select: { id: true, status: true, title: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const { status } = parsed.data;

    const post = await prisma.post.update({
      where: { id },
      data: { status: status as PostStatus },
      include: {
        author: { select: { id: true, nickname: true, email: true } },
        board: { select: { id: true, name: true } },
      },
    });

    await logAudit(
      req.user.id,
      "ADMIN_UPDATE_POST_STATUS",
      AuditTargetType.POST,
      id,
      { oldStatus: existing.status, newStatus: status, title: existing.title },
    );

    return NextResponse.json({ post });
  } catch (error) {
    console.error("PATCH /api/admin/posts/[id] error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
