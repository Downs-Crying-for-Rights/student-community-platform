import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * CSRF 保护：对修改性 API 请求检查 Origin/Referer 头
 * 仅当 Origin/Referer 存在且与当前域名不匹配时拒绝，允许无头请求（如移动端 API 调用）
 */
export function csrfCheck(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (!["POST", "PATCH", "DELETE", "PUT"].includes(method)) return null;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 无 Origin/Referer 的请求放行（API 客户端、移动端等）
  if (!origin && !referer) return null;

  const host = req.nextUrl.host;

  const checkUrl = (headerValue: string, headerName: string): NextResponse | null => {
    try {
      const url = new URL(headerValue);
      if (url.host !== host) {
        console.warn(`[CSRF] ${headerName} mismatch: got ${url.host}, expected ${host}`);
        return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
      }
    } catch {
      console.warn(`[CSRF] Invalid ${headerName}: ${headerValue}`);
      return NextResponse.json({ error: "请求来源不合法" }, { status: 403 });
    }
    return null;
  };

  if (origin) return checkUrl(origin, "Origin");
  if (referer) return checkUrl(referer, "Referer");
  return null;
}

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
 *
 * 注意：rate-limiter 依赖 ioredis（Node.js 原生模块），不兼容 Edge Runtime，
 * 因此使用动态 import 按需加载。Edge Runtime 仅执行 import 语句，实际
 * Redis 调用发生在 Node.js Runtime 的 API Route 中时才会触发此路径。
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
    // rate-limiter 依赖 ioredis（Node.js API），无法在 Edge Runtime 静态导入，保持动态 import
    const { enforceRateLimit } = await import("@/lib/rate-limiter");
    // @ts-expect-error — enforceRateLimit 返回 { response, result } | null，运行时解构为 RateLimitResult
    const { allowed, resetAt } = (await enforceRateLimit(ip, 60)) ?? {};
    if (!allowed) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(((resetAt as number) - Date.now()) / 1000)) } },
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
  // CSRF 检查（对修改性 API 请求）
  const csrfResponse = csrfCheck(req);
  if (csrfResponse) return csrfResponse;

  // API 路径：仅做 CSRF 检查，跳过认证逻辑
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

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
      // Prisma 依赖 Node.js fs/net 等原生模块，无法在 Edge Runtime 静态导入，保持动态 import
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
        // Prisma 依赖 Node.js fs/net 等原生模块，无法在 Edge Runtime 静态导入，保持动态 import
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

  // 已完成引导但未设置昵称 → 重定向至设置用户名页
  if (token.phone && (token.onboardingDone || token.quizPassed)) {
    const isSetUsernamePath = req.nextUrl.pathname.startsWith("/set-username") ||
      req.nextUrl.pathname.startsWith("/api/auth/username");
    if (isSetUsernamePath) return NextResponse.next();

    // 优先检查 JWT token 中是否已有 nickname（已在 JWT callback 中注入）
    if ((token as any).nickname) return NextResponse.next();

    // JWT 中没有 nickname，回退到 DB 查询
    try {
      const uid = (token.sub || (token as any).id || (token as any).userId) as string;
      if (uid) {
        // Prisma 依赖 Node.js fs/net 等原生模块，无法在 Edge Runtime 静态导入，保持动态 import
        const { prisma: db } = await import("@/lib/prisma");
        const user = await db.user.findUnique({
          where: { id: uid },
          select: { nickname: true },
        });
        if (user?.nickname) return NextResponse.next();
      }
    } catch { /* DB unavailable — redirect to set-username */ }

    return NextResponse.redirect(new URL("/set-username", req.url));
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
    "/api/:path*",
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
    "/set-username",
  ],
};
