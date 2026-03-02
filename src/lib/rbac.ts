import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

// ==================== Action & Resource Types ====================

export type Action =
  | "read"
  | "create_post"
  | "edit_own_post"
  | "delete_own_post"
  | "create_comment"
  | "edit_own_comment"
  | "delete_own_comment"
  | "like"
  | "bookmark"
  | "report"
  | "access_psychology"
  | "moderate_content"
  | "manage_reports"
  | "manage_tags"
  | "manage_users"
  | "manage_boards"
  | "manage_invites"
  | "view_audit_logs"
  | "manage_dcr_access"
  | "handle_dcr_cases";

export type Resource =
  | "post"
  | "comment"
  | "board"
  | "tag"
  | "report"
  | "user"
  | "invite"
  | "audit_log"
  | "dcr_case"
  | "psychology_zone"
  | "dcr_zone"
  | "notification"
  | "knowledge_article";

// ==================== Role Permission Map ====================

/**
 * Role hierarchy (each role inherits permissions from lower roles):
 *   USER < TRUSTED_USER < MODERATOR < ADMIN
 *   TRUSTED_USER < DCR_HELPER (branch)
 */

const USER_PERMISSIONS: ReadonlySet<Action> = new Set([
  "read",
  "create_post",
  "edit_own_post",
  "delete_own_post",
  "create_comment",
  "edit_own_comment",
  "delete_own_comment",
  "like",
  "bookmark",
  "report",
]);

const TRUSTED_USER_PERMISSIONS: ReadonlySet<Action> = new Set([
  ...USER_PERMISSIONS,
  "access_psychology",
]);

const MODERATOR_PERMISSIONS: ReadonlySet<Action> = new Set([
  ...TRUSTED_USER_PERMISSIONS,
  "moderate_content",
  "manage_reports",
  "manage_tags",
]);

const ADMIN_PERMISSIONS: ReadonlySet<Action> = new Set([
  ...MODERATOR_PERMISSIONS,
  "manage_users",
  "manage_boards",
  "manage_invites",
  "view_audit_logs",
  "manage_dcr_access",
]);

const DCR_HELPER_PERMISSIONS: ReadonlySet<Action> = new Set([
  ...TRUSTED_USER_PERMISSIONS,
  "handle_dcr_cases",
]);

const SUPER_ADMIN_PERMISSIONS: ReadonlySet<Action> = new Set([
  ...ADMIN_PERMISSIONS,
  "handle_dcr_cases",
]);


export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  USER: USER_PERMISSIONS,
  TRUSTED_USER: TRUSTED_USER_PERMISSIONS,
  MODERATOR: MODERATOR_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  DCR_HELPER: DCR_HELPER_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

// ==================== Role Hierarchy ====================

/**
 * Numeric role levels for hierarchy comparison.
 * Higher number = higher privilege. DCR_HELPER branches from TRUSTED_USER.
 */
const ROLE_LEVEL: Record<Role, number> = {
  USER: 0,
  TRUSTED_USER: 1,
  DCR_HELPER: 1,
  MODERATOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/**
 * Check if a role has admin-level privileges (ADMIN or SUPER_ADMIN).
 * Use this instead of `role === "ADMIN"` to ensure SUPER_ADMIN inherits all admin capabilities.
 */
export function isAdminRole(role: Role | string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Check if `role` meets or exceeds `requiredRole` in the hierarchy.
 * DCR_HELPER is treated as equivalent to TRUSTED_USER level.
 */
export function hasMinimumRole(role: Role, requiredRole: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[requiredRole];
}

// ==================== Permission Check ====================

/**
 * Check whether a role is allowed to perform `action` on `resource`.
 *
 * The `resource` parameter is reserved for future fine-grained checks
 * (e.g. board-zone–specific rules). Currently permissions are action-based.
 */
export function checkPermission(
  role: Role,
  action: Action,
  _resource?: Resource,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.has(action);
}

// ==================== API Route Auth Wrapper ====================

type RouteHandler = (
  req: NextRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

export interface AuthenticatedRequest extends NextRequest {
  user: { id: string; role: Role };
}

type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap an API route handler with authentication and optional role check.
 *
 * - Verifies the user has a valid session
 * - Optionally verifies the user meets `requiredRole` level
 * - Attaches `req.user` with `{ id, role }` for downstream use
 *
 * Usage:
 * ```ts
 * export const POST = withAuth(async (req) => {
 *   const { id, role } = req.user;
 *   // ...
 * }, "MODERATOR");
 * ```
 */
export function withAuth(
  handler: AuthenticatedHandler,
  requiredRole?: Role,
): RouteHandler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userRole = (session.user.role ?? "USER") as Role;

    if (requiredRole && !hasMinimumRole(userRole, requiredRole)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // Attach user info to request for downstream handlers
    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.user = { id: session.user.id, role: userRole };

    return handler(authenticatedReq, context);
  };
}

export interface OptionalAuthRequest extends NextRequest {
  user?: { id: string; role: Role };
}

type OptionalAuthHandler = (
  req: OptionalAuthRequest,
  context: { params: Record<string, string> },
) => Promise<NextResponse> | NextResponse;

/**
 * Wrap an API route handler with optional authentication.
 * If the user has a valid session, attaches `req.user`; otherwise proceeds without it.
 * Useful for public endpoints that show extra data for logged-in users.
 */
export function withOptionalAuth(handler: OptionalAuthHandler): RouteHandler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    const optReq = req as OptionalAuthRequest;

    if (session?.user?.id) {
      const userRole = (session.user.role ?? "USER") as Role;
      optReq.user = { id: session.user.id, role: userRole };
    }

    return handler(optReq, context);
  };
}

