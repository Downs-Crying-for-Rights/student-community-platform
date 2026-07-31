import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 设置用户名相关路径 — 未设昵称时唯一可访问的路径
 */
const SET_USERNAME_PATHS = ["/set-username", "/api/auth/username"];
const isSetUsernamePath = (pathname: string) =>
  SET_USERNAME_PATHS.some((p) => pathname.startsWith(p));

/** Authenticated users without a phone may only visit the binding page. */
export const PHONE_REQUIRED_PAGE_PATHS = ["/bindphone"] as const;

export function isPhoneRequiredPageAllowed(pathname: string): boolean {
  return PHONE_REQUIRED_PAGE_PATHS.includes(pathname as "/bindphone");
}

const PUBLIC_AUTH_PAGE_PATHS = ["/login", "/ban-appeal"] as const;

/**
 * 认证中间件 — 纯 JWT 检测（无 DB 查询，兼容 Edge Runtime）
 *
 * 检查顺序：短信注册资料补全 → 昵称 → 新手引导
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
    if (PUBLIC_AUTH_PAGE_PATHS.includes(pathname as (typeof PUBLIC_AUTH_PAGE_PATHS)[number])) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // This Edge check gives immediate page redirects. API wrappers repeat the
  // check against the server-refreshed session and remain authoritative.
  if (!(token as any).phone && !isPhoneRequiredPageAllowed(pathname)) {
    const bindPhoneUrl = new URL("/bindphone", req.url);
    bindPhoneUrl.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(bindPhoneUrl);
  }
  if (!(token as any).phone) {
    return NextResponse.next();
  }

  // 新账号必须先在一个页面补齐昵称、头像和 QQ 号。
  if ((token as any).profileCompletionRequired) {
    if (pathname.startsWith("/settings/profile")) {
      return NextResponse.next();
    }
    const profileUrl = new URL("/settings/profile", req.url);
    profileUrl.searchParams.set("required", "1");
    return NextResponse.redirect(profileUrl);
  }

  // ========== 第1优先级：强制设置用户名 ==========
  if (!isSetUsernamePath(pathname)) {
    if (!(token as any).nickname) {
      return NextResponse.redirect(new URL("/set-username", req.url));
    }
  }

  // ========== 第2优先级：新手引导 ==========
  if (!(token.onboardingDone || token.quizPassed)) {
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Member pages and RSC navigation responses must not be reused across
  // deployments. This prevents the client router from mixing an old page
  // payload with the current global navigation shell.
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  return response;
}

/**
 * 匹配所有页面路由
 */
export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|VERSION(?:/|$)|DEPLOYMENT(?:/|$)|.*\\..*).*)"],
};
