import type { Prisma, PrismaClient } from "@prisma/client";

export type ChatRoomMemberRole = "OWNER" | "ADMIN" | "MEMBER";
export type ChatRoomModerationAction = "KICK" | "BAN";

export type ChatRoomBanState = {
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export type ChatRoomPolicyClient = Pick<PrismaClient, "chatRoomBan"> | Prisma.TransactionClient;

export function isActiveChatRoomBan(
  ban: ChatRoomBanState | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(
    ban &&
      ban.revokedAt === null &&
      (ban.expiresAt === null || ban.expiresAt.getTime() > now.getTime()),
  );
}

export function activeChatRoomBanWhere(
  roomId: string,
  userId: string,
  now: Date = new Date(),
): Prisma.ChatRoomBanWhereInput {
  return {
    roomId,
    userId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function findActiveChatRoomBan(
  client: ChatRoomPolicyClient,
  roomId: string,
  userId: string,
  now: Date = new Date(),
) {
  return client.chatRoomBan.findFirst({
    where: activeChatRoomBanWhere(roomId, userId, now),
  });
}

export function canManageChatRoomMember(
  actorRole: string | null | undefined,
  targetRole: string,
  isPlatformModerator: boolean,
): boolean {
  if (targetRole === "OWNER") return false;
  if (isPlatformModerator) return true;
  if (actorRole === "OWNER") return true;
  return actorRole === "ADMIN" && targetRole === "MEMBER";
}

export function moderationBanExpiresAt(
  action: ChatRoomModerationAction,
  now: Date = new Date(),
): Date | null {
  return action === "KICK" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;
}
