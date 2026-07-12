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

  // Use x-forwarded-for in production (behind proxy), fallback to direct IP
  const headerIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const ip = headerIP.split(",")[0].trim(); // take the first IP if multiple proxies

  // Simple in-memory rate limit using a WeakMap-style counter (per-window)
  // Production use Redis-backed limiter; this is a dev/staging safeguard
  try {
    const { enforceRateLimit } = await import("@/lib/rate-limiter");
    const result = await enforceRateLimit(ip, 60);
    if (!result.allowed) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) } },
      );
    }
  } catch {
    // Redis unavailable — degrade gracefully (don't block requests)
  }
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

  // 已认证但 phone 为空，且路径不在白名单中 → 检查 DB 是否已有手机号
  if (!token.phone && !isBindphoneWhitelisted(req.nextUrl.pathname)) {
    // DB 回退：JWT 中 phone 可能过期（用户刚绑定手机号），查一次 DB
    try {
      const { prisma: db } = await import("@/lib/prisma");
      const uid = (token.sub || (token as any).id || (token as any).userId) as string;
      if (uid) {
        const user = await db.user.findUnique({
          where: { id: uid },
          select: { phone: true },
        });
        if (user?.phone) {
          // 手机号已在 DB 中绑定，但 JWT 未同步 — 放行此请求
          return NextResponse.next();
        }
      }
    } catch {
      // DB unavailable — fall through to bindphone redirect
    }
    return NextResponse.redirect(new URL("/bindphone", req.url));
  }

  // 已绑定手机号但未完成新手引导 → DB 回退检查
  if (token.phone && !(token.onboardingDone || token.quizPassed)) {
    const isOnboardingPath = req.nextUrl.pathname.startsWith("/onboarding") ||
      req.nextUrl.pathname.startsWith("/api/onboarding");
    if (isOnboardingPath) return NextResponse.next();

    // JWT 可能落后 DB — 检查 DB 中是否已完成引导
    try {
      const uid = (token.sub || (token as any).id || (token as any).userId) as string;
      if (uid) {
        const { prisma: db } = await import("@/lib/prisma");
        const user = await db.user.findUnique({
          where: { id: uid },
          select: { onboardingDone: true, quizPassed: true },
        });
        if (user?.onboardingDone || user?.quizPassed) {
          return NextResponse.next();
        }
      }
    } catch { /* DB unavailable — redirect to onboarding */ }

    return NextResponse.redirect(new URL("/onboarding", req.url));
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
