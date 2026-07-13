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

/** 检查路径是否在认证白名单中 */
export function isAuthWhitelisted(pathname: string): boolean {
  return AUTH_WHITELIST.some((prefix) => pathname.startsWith(prefix));
}

/**
 * 认证中间件 — 纯 JWT 检测（无 DB 查询，兼容 Edge Runtime）
 *
 * 检查顺序：昵称 → 手机号 → 新手引导
 * 不设置用户名无法进行任何操作（仅允许 /set-username 和必需 API）
 *
 * 注意：Prisma Client 不支持 Edge Runtime，因此中间件仅依赖 JWT token。
 * 用户更新个人资料后，前端需调用 session.update() 刷新 JWT。
 */
export default async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const pathname = req.nextUrl.pathname;

  // 未认证 → 重定向至登录页
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // ========== 第1优先级：强制设置用户名 ==========
  if (!isSetUsernamePath(pathname)) {
    if (!(token as any).nickname) {
      return NextResponse.redirect(new URL("/set-username", req.url));
    }
  }

  // ========== 第2优先级：手机号绑定 ==========
  if (!token.phone && !isAuthWhitelisted(pathname)) {
    return NextResponse.redirect(new URL("/bindphone", req.url));
  }

  // ========== 第3优先级：新手引导 ==========
  if (token.phone && !(token.onboardingDone || token.quizPassed)) {
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
}

/**
 * 匹配所有页面路由
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
