import type { BoardZone, PostVisibility, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { hasMinimumRole, isAdminRole } from "@/lib/rbac";

export type PostAccessUser = { id: string; role: Role } | undefined;

export type PostAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: string };

export async function checkPostAccess(
  user: PostAccessUser,
  post: {
    board: { zone: BoardZone };
    authorId?: string;
    visibility?: PostVisibility;
    caseId?: string | null;
  },
): Promise<PostAccessDecision> {
  const { zone } = post.board;

  if (zone !== "PUBLIC") {
    if (!user) return { allowed: false, status: 401, error: "请先登录" };

    const access = await prisma.user.findUnique({
      where: { id: user.id },
      select: { psychAccess: true, dcrAccess: true },
    });

    if (zone === "PSYCHOLOGY" && !access?.psychAccess && !hasMinimumRole(user.role, "MODERATOR")) {
      return { allowed: false, status: 403, error: "无心理区访问权限" };
    }
    if (zone === "DCR" && !access?.dcrAccess && !isAdminRole(user.role)) {
      return { allowed: false, status: 403, error: "无 DCR 区访问权限" };
    }
  }

  if (zone === "PSYCHOLOGY" && post.visibility === "MATCHED") {
    return { allowed: false, status: 403, error: "匹配可见帖子暂不可访问" };
  }
  if (
    post.visibility === "MODS_ONLY"
    && (!user || (post.authorId !== user.id && !hasMinimumRole(user.role, "MODERATOR")))
  ) {
    return { allowed: false, status: 403, error: "该帖子仅作者和管理人员可访问" };
  }

  return { allowed: true };
}

function anonymousAuthor(anonymousId: string | null | undefined, entityId: string) {
  const id = anonymousId ?? `anonymous-${entityId}`;
  return { id, nickname: anonymousId ?? "匿名用户", avatar: null, isVerified: false };
}

export function anonymizePsychologyPost<T extends {
  id: string;
  authorId: string;
  anonymousId?: string | null;
  author: unknown;
  board: { zone: BoardZone };
}>(post: T): T {
  if (post.board.zone !== "PSYCHOLOGY") return post;
  const author = anonymousAuthor(post.anonymousId, post.id);
  return { ...post, authorId: author.id, author } as T;
}

type CommentWithAuthor = {
  id: string;
  authorId?: string;
  anonymousId?: string | null;
  author: unknown;
  replies?: CommentWithAuthor[];
};

export function anonymizePsychologyComment<T extends CommentWithAuthor>(comment: T): T {
  const author = anonymousAuthor(comment.anonymousId, comment.id);
  return {
    ...comment,
    authorId: author.id,
    author,
    ...(comment.replies
      ? { replies: comment.replies.map(anonymizePsychologyComment) }
      : {}),
  } as T;
}
