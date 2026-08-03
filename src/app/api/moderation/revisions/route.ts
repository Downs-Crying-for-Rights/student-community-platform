import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { assessPsychContentSafety } from "@/lib/psych-moderation";

export const GET = withAuth(async (_req: AuthenticatedRequest) => {
  const revisions = await prisma.postRevision.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          author: { select: { id: true, nickname: true, avatar: true } },
          board: { select: { id: true, name: true, zone: true } },
          tags: { include: { tag: true } },
        },
      },
    },
  });
  return NextResponse.json({
    revisions: revisions.map((revision) => {
      const safety = revision.post.board.zone === "PSYCHOLOGY"
        ? assessPsychContentSafety(`${revision.title}\n${revision.content}`)
        : { priority: "STANDARD" as const, notice: null };
      return {
        id: revision.post.id,
        revisionId: revision.id,
        title: revision.title,
        content: revision.content,
        status: "PENDING",
        createdAt: revision.createdAt,
        author: revision.post.author,
        board: revision.post.board,
        tags: revision.post.tags,
        currentTitle: revision.post.title,
        currentContent: revision.post.content,
        safetyPriority: safety.priority,
        safetyNotice: safety.notice,
      };
    }),
  });
}, "MODERATOR");
