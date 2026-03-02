import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 白名单路径 — 不触发手机号绑定重定向
 * 使用 startsWith 进行前缀匹配，例如 /api/auth/callback 匹配 /api/auth
 */
export const BINDPHONE_WHITELIST = [
  "/api/auth",
  "/api/sms",
  "/bindphone",
  "/logout",
  "/login",
];

/**
 * 检查路径是否在手机号绑定白名单中
 */
export function isBindphoneWhitelisted(pathname: string): boolean {
  return BINDPHONE_WHITELIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * 认证中间件 — 保护需要登录的路由 + 手机号绑定守卫
 *
 * 1. 未认证用户访问受保护路由时，自动重定向至 /login
 * 2. 已认证但未绑定手机号的用户，重定向至 /bindphone（白名单路径除外）
 */
export default async function middleware(req: NextRequest) {
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
