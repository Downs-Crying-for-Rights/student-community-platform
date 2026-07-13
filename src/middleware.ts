import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 设置用户名相关路径 — 未设昵称时唯一可访问的路径
 */
const SET_USERNAME_PATHS = ["/set-username", "/api/auth/username"];
const isSetUsernamePath = (pathname: string) =>
  SET_USERNAME_PATHS.some((p) => pathname.startsWith(p));

/**
 * 白名单路径 — 不触发手机号绑定 / 引导 / 昵称 重定向
 */
export const AUTH_WHITELIST = [
  "/api/auth",
  "/api/sms",
  "/bindphone",
  "/onboarding",
  "/api/onboarding",
  "/logout",
  "/login",
  "/set-username",
];

/**
 * 全局限流：对 /api/* 路径做简单 IP 限流 (60 req/min)
 */
export async function globalRateLimit(req: NextRequest): Promise<NextResponse | null> {
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;
  if (req.nextUrl.pathname.startsWith("/api/auth/") || req.nextUrl.pathname.startsWith("/_next/")) return null;

  const headerIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const ip = headerIP.split(",")[0].trim();

  try {
    const { enforceRateLimit } = await import("@/lib/rate-limiter");
    const rateLimit = await enforceRateLimit(ip, 60);
    if (rateLimit) {
      return rateLimit.response;
    }
  } catch {
    // Redis unavailable — degrade gracefully
  }
  return null;
}

/** 检查路径是否在认证白名单中 */
export function isAuthWhitelisted(pathname: string): boolean {
  return AUTH_WHITELIST.some((prefix) => pathname.startsWith(prefix));
}

async function checkDbNickname(token: any): Promise<boolean> {
  try {
    const { prisma: db } = await import("@/lib/prisma");
    const uid = (token.sub || token.id || token.userId) as string;
    if (uid) {
      const user = await db.user.findUnique({
        where: { id: uid },
        select: { nickname: true },
      });
      return !!user?.nickname;
    }
  } catch { /* DB unavailable */ }
  return false;
}

/**
 * 认证中间件 — 强制检查顺序：昵称 → 手机号 → 新手引导
 * 不设置用户名无法进行任何操作（仅允许 /set-username 和必需 API）
 */
export default async function middleware(req: NextRequest) {
  const rateLimitResponse = await globalRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const token = await getToken({ req });

  // 未认证 → 重定向至登录页
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const pathname = req.nextUrl.pathname;

  // ========== 第1优先级：强制设置用户名 ==========
  // 未设昵称时，仅允许访问 /set-username 和相关 API
  if (!isSetUsernamePath(pathname)) {
    let hasNickname = !!(token as any).nickname;

    // JWT 中没有 nickname → 回退 DB 查询
    if (!hasNickname) {
      hasNickname = await checkDbNickname(token);
    }

    if (!hasNickname) {
      return NextResponse.redirect(new URL("/set-username", req.url));
    }
  }

  // ========== 第2优先级：手机号绑定 ==========
  if (!token.phone && !isAuthWhitelisted(pathname)) {
    try {
      const { prisma: db } = await import("@/lib/prisma");
      const uid = (token.sub || (token as any).id || (token as any).userId) as string;
      if (uid) {
        const user = await db.user.findUnique({
          where: { id: uid },
          select: { phone: true },
        });
        if (user?.phone) return NextResponse.next();
      }
    } catch { /* DB unavailable */ }
    return NextResponse.redirect(new URL("/bindphone", req.url));
  }

  // ========== 第3优先级：新手引导 ==========
  if (token.phone && !(token.onboardingDone || token.quizPassed)) {
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding")) {
      return NextResponse.next();
    }
    try {
      const uid = (token.sub || (token as any).id || (token as any).userId) as string;
      if (uid) {
        const { prisma: db } = await import("@/lib/prisma");
        const user = await db.user.findUnique({
          where: { id: uid },
          select: { onboardingDone: true, quizPassed: true },
        });
        if (user?.onboardingDone || user?.quizPassed) return NextResponse.next();
      }
    } catch { /* DB unavailable */ }
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
}

/**
 * 匹配所有页面路由（排除 _next 静态资源和 api）
 * 昵称强制检查覆盖所有路径
 */
export const config = {
  matcher: [
    "/",
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
    "/discover",
    "/search",
    "/post/:path*",
    "/kb/:path*",
    "/help/:path*",
    "/chat/:path*",
    "/psych/:path*",
  ],
};
