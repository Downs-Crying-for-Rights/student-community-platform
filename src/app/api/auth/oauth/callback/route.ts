import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { getUserByCode, SUPPORTED_TYPES, type OAuthType } from "@/lib/oauth-aggregator";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/oauth/callback?type=qq&code=xxx
 * 第三方 OAuth 登录回调：交换 code 获取用户信息，创建/关联账户，签发 JWT session
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as OAuthType | null;
  const code = searchParams.get("code");

  if (!type || !code) {
    return redirectToLogin("缺少 type 或 code 参数");
  }

  if (!(SUPPORTED_TYPES as readonly string[]).includes(type)) {
    return redirectToLogin(`不支持的登录方式: ${type}`);
  }

  // Step 1: 通过 code 从聚合平台获取用户信息
  let userInfo;
  try {
    userInfo = await getUserByCode(type, code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取用户信息失败";
    return redirectToLogin(message);
  }

  if (!userInfo.social_uid) {
    return redirectToLogin("未获取到用户标识");
  }

  try {
    // Step 2: 查找已有的 Account 关联
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: `oauth_${type}`,
          providerAccountId: userInfo.social_uid,
        },
      },
      include: { user: true },
    });

    let userRecord: User;

    if (existingAccount) {
      // 已有账户，直接使用
      userRecord = existingAccount.user;
    } else {
      // Step 3: 创建新用户和 Account 关联
      const nickname = userInfo.nickname || `${type}_用户${userInfo.social_uid.slice(0, 8)}`;

      userRecord = await prisma.user.create({
        data: {
          nickname,
          avatar: userInfo.faceimg || null,
          accounts: {
            create: {
              type: "oauth",
              provider: `oauth_${type}`,
              providerAccountId: userInfo.social_uid,
              access_token: userInfo.access_token,
            },
          },
        },
      });
    }

    // Step 4: 生成 JWT session token
    // 必须与 auth.ts 中 jwt 回调 / middleware.ts 依赖的字段保持一致，否则登录后会
    // 被 jwt 回调判为失效（securityVersion 不匹配），或被 middleware 误导向
    // /set-username 与 /onboarding 形成死循环。
    const token = await encode({
      token: buildSessionClaims(userRecord),
      secret: process.env.NEXTAUTH_SECRET as string,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Step 5: 在重定向响应上直接设置 session cookie 并重定向到首页。
    // 注意：必须设置在 NextResponse 对象上，而不是 next/headers 的 cookies()，
    // 后者在 Route Handler 返回 redirect 时不可靠，会导致 cookie 丢失、登录无效。
    const isProduction = process.env.NODE_ENV === "production";
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(
      isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      token,
      {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      },
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器内部错误";
    return redirectToLogin(message);
  }
}

/**
 * 将数据库 User 记录映射为 JWT 声明，字段对齐 auth.ts 的 jwt 回调输出。
 * middleware.ts 直接读取这些原始声明做路由守卫，jwt 回调也会在每次刷新时
 * 以数据库为准重新注入，因此这里只需保证关键字段（securityVersion、
 * nickname、onboardingDone、quizPassed 等）存在即可。
 */
function buildSessionClaims(user: User) {
  return {
    sub: user.id,
    id: user.id,
    name: user.nickname ?? undefined,
    picture: user.avatar ?? null,
    role: user.role,
    phone: user.phone ?? null,
    nickname: user.nickname ?? null,
    avatar: user.avatar ?? null,
    onboardingDone: user.onboardingDone,
    quizPassed: user.quizPassed,
    dcrAccess: user.dcrAccess,
    isBanned: Boolean(user.isBanned || user.deactivatedAt),
    banUntil: user.banUntil ? user.banUntil.toISOString() : null,
    isMuted: user.isMuted,
    muteUntil: user.muteUntil ? user.muteUntil.toISOString() : null,
    securityVersion: user.securityVersion,
    profileCompletionRequired: user.profileCompletionRequired,
    isVerified: Boolean(user.realVerifiedAt || user.studentVerifiedAt),
  };
}

function redirectToLogin(error: string) {
  const loginUrl = new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000");
  // searchParams.set 会自动对值做 URL 编码，无需再手动 encodeURIComponent，
  // 否则会出现双重编码，前端拿到的是 %xx 形式而无法展示原始错误信息。
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}
