import type { BoardZone, PostStatus, PostVisibility, Prisma, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { hasMinimumRole } from "@/lib/rbac";
import { canUseDcrWorkspace } from "@/lib/dcr-capabilities";

export type PostAccessUser = { id: string; role: Role } | undefined;

export type PostAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; error: string };

export function dcrMatchedParticipantWhere(userId: string): Prisma.PostWhereInput {
  return {
    OR: [
      { authorId: userId },
      { case_: { submitterId: userId } },
      { case_: { handlerId: userId } },
      { case_: { handlers: { some: { userId } } } },
      { case_: { mutualAidTasks: { some: { helpSessions: { some: { OR: [{ requesterId: userId }, { helperId: userId }] } } } } } },
    ],
  };
}

export async function checkPostZoneAccess(
  user: PostAccessUser,
  zone: BoardZone,
): Promise<PostAccessDecision> {
  if (zone === "PUBLIC") return { allowed: true };
  if (!user) return { allowed: false, status: 401, error: "请先登录" };
  if (hasMinimumRole(user.role, "MODERATOR")) return { allowed: true };

  const access = await prisma.user.findUnique({
    where: { id: user.id },
    select: { psychAccess: true, dcrAccess: true, dcrPledgeSigned: true },
  });
  if (zone === "PSYCHOLOGY" && !access?.psychAccess) {
    return { allowed: false, status: 403, error: "无心理区访问权限" };
  }
  if (zone === "DCR" && (!access || !canUseDcrWorkspace({ ...access, role: user.role }))) {
    return { allowed: false, status: 403, error: "无 DCR 区访问权限" };
  }
  return { allowed: true };
}

export async function checkPostAccess(
  user: PostAccessUser,
  post: {
    id?: string;
    board: { zone: BoardZone };
    authorId?: string;
    visibility?: PostVisibility;
    caseId?: string | null;
    status?: PostStatus;
    author?: { isShadowBanned?: boolean };
    case_?: { requestStatus?: string } | null;
  },
  options?: { skipZoneAccess?: boolean },
): Promise<PostAccessDecision> {
  const { zone } = post.board;
  if (!options?.skipZoneAccess) {
    const zoneAccess = await checkPostZoneAccess(user, zone);
    if (!zoneAccess.allowed) return zoneAccess;
  }

  const isModerator = Boolean(user && hasMinimumRole(user.role, "MODERATOR"));
  const isAuthor = Boolean(user && post.authorId === user.id);
  if (post.status && post.status !== "PUBLISHED" && !isAuthor && !isModerator) {
    return { allowed: false, status: 403, error: "该帖子当前不可访问" };
  }
  if (post.author?.isShadowBanned && !isAuthor && !isModerator) {
    return { allowed: false, status: 403, error: "该帖子当前不可访问" };
  }

  if (zone === "PSYCHOLOGY" && post.visibility === "MATCHED") {
    return { allowed: false, status: 403, error: "匹配可见帖子暂不可访问" };
  }
  if (
    post.visibility === "MODS_ONLY"
    && !isAuthor
    && !isModerator
  ) {
    return { allowed: false, status: 403, error: "该帖子仅作者和管理人员可访问" };
  }

  if (zone === "DCR" && post.caseId && !isAuthor && !isModerator) {
    const relatedCase = await prisma.case.findUnique({
      where: { id: post.caseId },
      select: {
        requestStatus: true,
        submitterId: true,
        handlerId: true,
        handlers: { where: { userId: user!.id }, select: { userId: true } },
        mutualAidTasks: {
          where: { helpSessions: { some: { OR: [{ requesterId: user!.id }, { helperId: user!.id }] } } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!relatedCase || relatedCase.requestStatus !== "APPROVED") {
      return { allowed: false, status: 403, error: "该帖子当前不可访问" };
    }
    if (
      post.visibility === "MATCHED"
      && relatedCase.submitterId !== user!.id
      && relatedCase.handlerId !== user!.id
      && relatedCase.handlers.length === 0
      && relatedCase.mutualAidTasks.length === 0
    ) {
      return { allowed: false, status: 403, error: "无权访问该匹配帖子" };
    }
  } else if (zone === "DCR" && post.visibility === "MATCHED" && !isAuthor && !isModerator) {
    return { allowed: false, status: 403, error: "无权访问该匹配帖子" };
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
