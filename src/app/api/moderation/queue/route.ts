import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, hasMinimumRole, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { assessPsychContentSafety, psychSafetyPriorityRank } from "@/lib/psych-moderation";
import { getLatestPostApprovalAudits } from "@/lib/post-approval-audit";
import { z } from "zod";

const moderationQueueQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "PUBLISHED", "REJECTED"]).default("PENDING"),
  zone: z.enum(["PUBLIC", "PSYCHOLOGY", "DCR"]).optional(),
  boardId: z.string().optional(),
});

/**
 * GET /api/moderation/queue
 * Moderator+ only: list posts for the moderation workspace.
 * Defaults to PENDING and supports status, zone, board, and pagination filters.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    if (!hasMinimumRole(req.user.role, "MODERATOR")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = moderationQueueQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      zone: searchParams.get("zone") ?? undefined,
      boardId: searchParams.get("boardId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, status, zone, boardId } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where = {
      status,
      ...(boardId ? { boardId } : zone ? { board: { zone } } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, nickname: true, avatar: true } },
          board: { select: { id: true, name: true, zone: true } },
          tags: { include: { tag: { select: { id: true, name: true } } } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    const latestApprovalByPost = await getLatestPostApprovalAudits(posts.map((post) => post.id));

    const prioritizedPosts = posts
      .map((post) => {
        const safety = post.board.zone === "PSYCHOLOGY"
          ? assessPsychContentSafety(`${post.title}\n${post.content}`)
          : { priority: "STANDARD" as const, notice: null };
        return {
          ...post,
          approvalAudit: latestApprovalByPost.get(post.id) ?? null,
          safetyPriority: safety.priority,
          safetyNotice: safety.notice,
        };
      })
      .sort((a, b) => {
        const priorityDelta = psychSafetyPriorityRank(a.safetyPriority)
          - psychSafetyPriorityRank(b.safetyPriority);
        if (priorityDelta !== 0) return priorityDelta;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return NextResponse.json({ posts: prioritizedPosts, total, page, pageSize, status });
  } catch (error) {
    console.error("GET /api/moderation/queue error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
