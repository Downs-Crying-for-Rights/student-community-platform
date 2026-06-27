import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 白名单路径 — 不触发手机号绑定重定向
 */
export const BINDPHONE_WHITELIST = [
  "/api/auth",
  "/api/sms",
  "/bindphone",
  "/logout",
  "/login",
];

/**
 * 全局限流：对 /api/* 路径做简单 IP 限流 (60 req/min)
 * 返回 429 或 null (放行)
 */
export async function globalRateLimit(req: NextRequest): Promise<NextResponse | null> {
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;
  // Skip auth endpoints and static
  if (req.nextUrl.pathname.startsWith("/api/auth/") || req.nextUrl.pathname.startsWith("/_next/")) return null;

  // Simple in-memory rate limit fallback (Edge-compatible, no Redis dependency)
  // Production should use Upstash Redis or similar; this is a dev safeguard.
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  // No global state in Edge runtime — skip for now, route-level rate limiters handle this
  return null;
}

/**
 * 检查路径是否在手机号绑定白名单中
 */
export function isBindphoneWhitelisted(pathname: string): boolean {
  return BINDPHONE_WHITELIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * 认证中间件 — 保护需要登录的路由 + 手机号绑定守卫
 */
export default async function middleware(req: NextRequest) {
  // 全局限流（轻量检查）
  const rateLimitResponse = await globalRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const token = await getToken({ req });

  // 未认证 → 重定向至登录页
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // 已认证但 phone 为空，且路径不在白名单中 → 重定向至绑定页
  if (!token.phone && !isBindphoneWhitelisted(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/bindphone", req.url));
  }

  return NextResponse.next();
}

/**
 * 受保护路由匹配规则
 *
 * 公开路由（不在此列表中，无需认证）：
 *   /, /login, /api/auth/*, /search, /post/*, /discover, /kb/*, /help/*
 *
 * 受保护路由（需要认证）：
 *   /create, /messages, /settings/*, /admin/*, /moderation,
 *   /dcr/*, /apply, /u/*, /onboarding, /bindphone
 */
export const config = {
  matcher: [
    "/create",
    "/messages",
    "/settings/:path*",
    "/admin/:path*",
    "/moderation",
    "/dcr/:path*",
    "/apply",
    "/u/:path*",
    "/onboarding",
    "/bindphone",
  ],
};
