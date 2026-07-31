export const PHONE_GATE_AREAS = [
  "communityBrowse",
  "contentCreate",
  "communityInteract",
  "messages",
  "groupChat",
  "psychology",
  "support",
  "profile",
] as const;

export type PhoneGateArea = (typeof PHONE_GATE_AREAS)[number];
export type PhoneRequiredAreas = Record<PhoneGateArea, boolean>;

export interface RegistrationAccessPolicy {
  emailEnabled: boolean;
  inviteEnabled: boolean;
  qqEnabled: boolean;
  phoneRequired: boolean;
}

export interface PublicAccessPolicy {
  registration: RegistrationAccessPolicy;
  phoneRequiredAreas: PhoneRequiredAreas;
  phoneVerified: boolean;
}

export const DEFAULT_PHONE_REQUIRED_AREAS: PhoneRequiredAreas = {
  communityBrowse: false,
  contentCreate: false,
  communityInteract: false,
  messages: false,
  groupChat: false,
  psychology: false,
  support: false,
  profile: false,
};

export const DEFAULT_REGISTRATION_ACCESS_POLICY: RegistrationAccessPolicy = {
  emailEnabled: true,
  inviteEnabled: true,
  qqEnabled: true,
  phoneRequired: false,
};

export function parsePhoneRequiredAreas(value: unknown): PhoneRequiredAreas {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PHONE_REQUIRED_AREAS };
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    PHONE_GATE_AREAS.map((area) => [area, source[area] === true]),
  ) as PhoneRequiredAreas;
}

function startsWithPath(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function phoneGateAreaForPage(pathname: string): PhoneGateArea | null {
  if (pathname === "/" || startsWithPath(pathname, "/discover") || startsWithPath(pathname, "/search") || startsWithPath(pathname, "/post")) return "communityBrowse";
  if (startsWithPath(pathname, "/create")) return "contentCreate";
  if (startsWithPath(pathname, "/messages")) return "messages";
  if (startsWithPath(pathname, "/chat")) return "groupChat";
  if (startsWithPath(pathname, "/psych")) return "psychology";
  if (startsWithPath(pathname, "/support")) return "support";
  if (startsWithPath(pathname, "/settings") || startsWithPath(pathname, "/u")) return "profile";
  return null;
}

export function phoneGateAreaForApi(pathname: string, method: string): PhoneGateArea | null {
  if (pathname.startsWith("/api/admin/") || pathname.startsWith("/api/auth/") || pathname === "/api/access-policy") return null;
  if (pathname.startsWith("/api/chat/")) return "groupChat";
  if (pathname.startsWith("/api/dm/") || pathname === "/api/dm" || pathname.startsWith("/api/notifications")) return "messages";
  if (pathname.startsWith("/api/psych/")) return "psychology";
  if (pathname.startsWith("/api/support/" ) || pathname === "/api/support") return "support";
  if (pathname.startsWith("/api/users/")) return "profile";
  if (pathname.startsWith("/api/posts/")) {
    if (pathname.endsWith("/comments") || pathname.endsWith("/like") || pathname.endsWith("/bookmark")) return method === "GET" ? "communityBrowse" : "communityInteract";
    return method === "GET" ? "communityBrowse" : "contentCreate";
  }
  if (pathname === "/api/posts") return method === "GET" ? "communityBrowse" : "contentCreate";
  if (pathname.startsWith("/api/comments/")) return "communityInteract";
  if (pathname === "/api/search" || pathname === "/api/recommendations" || pathname.startsWith("/api/boards")) return "communityBrowse";
  return null;
}
