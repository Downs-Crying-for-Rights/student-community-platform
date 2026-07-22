import type { UserPunishmentType } from "@prisma/client";

export const STRUCTURED_PUNISHMENT_TYPES = [
  "WARNING",
  "TEMPORARY_MUTE",
  "PERMANENT_MUTE",
  "TEMPORARY_BAN",
  "PERMANENT_BAN",
] as const satisfies readonly UserPunishmentType[];

export type StructuredPunishmentType = (typeof STRUCTURED_PUNISHMENT_TYPES)[number];

export const PUNISHMENT_TYPE_LABELS: Record<UserPunishmentType, string> = {
  WARNING: "警告",
  TEMPORARY_MUTE: "临时禁言",
  PERMANENT_MUTE: "永久禁言",
  TEMPORARY_BAN: "临时封禁",
  PERMANENT_BAN: "永久封禁",
  ACCOUNT_BAN: "账号封禁（旧版）",
  POST_SHADOW_HIDE: "帖子影子隐藏（旧版）",
};

export function isTemporaryPunishment(type: UserPunishmentType): boolean {
  return type === "TEMPORARY_MUTE" || type === "TEMPORARY_BAN";
}

export function isMutePunishment(type: UserPunishmentType): boolean {
  return type === "TEMPORARY_MUTE" || type === "PERMANENT_MUTE";
}

export function isBanPunishment(type: UserPunishmentType): boolean {
  return type === "TEMPORARY_BAN" || type === "PERMANENT_BAN" || type === "ACCOUNT_BAN";
}

export function requiresAcknowledgement(type: UserPunishmentType): boolean {
  return type === "WARNING" || isMutePunishment(type);
}

export function isCommunicationWrite(method: string, pathname: string): boolean {
  if (!["POST", "PUT", "PATCH"].includes(method.toUpperCase())) return false;
  return [
    /^\/api\/posts(?:\/[^/]+)?$/,
    /^\/api\/posts\/[^/]+\/comments$/,
    /^\/api\/comments\/[^/]+$/,
    /^\/api\/dm(?:\/thread\/[^/]+)?$/,
    /^\/api\/chat\/rooms(?:\/[^/]+(?:\/messages)?)?$/,
    /^\/api\/cases\/[^/]+\/messages$/,
    /^\/api\/dcr\/tasks\/[^/]+\/chat$/,
    /^\/api\/dcr\/cycles\/[^/]+\/links\/[^/]+\/dm$/,
    /^\/api\/psych\/session\/[^/]+\/message$/,
    /^\/api\/qq\/(?:draft\/submit|publish\/confirm)$/,
  ].some((pattern) => pattern.test(pathname));
}

export function punishmentRouteAllowsBanned(pathname: string): boolean {
  return pathname === "/api/punishments/status"
    || pathname === "/api/punishments/acknowledge"
    || /^\/api\/punishments\/[^/]+\/appeal$/.test(pathname)
    || pathname.startsWith("/api/support")
    || pathname.startsWith("/api/settings")
    || pathname.startsWith("/api/account/");
}
