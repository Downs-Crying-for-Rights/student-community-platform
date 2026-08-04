import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import { getUserByCode, SUPPORTED_TYPES, type OAuthType } from "@/lib/oauth-aggregator";
import { prisma } from "@/lib/prisma";

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

    let userId: string;

    if (existingAccount) {
      // 已有账户，直接使用
      userId = existingAccount.userId;
    } else {
      // Step 3: 创建新用户和 Account 关联
      const nickname = userInfo.nickname || `${type}_用户${userInfo.social_uid.slice(0, 8)}`;

      const newUser = await prisma.user.create({
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
      userId = newUser.id;
    }

    // Step 4: 生成 JWT session token
    const token = await encode({
      token: {
        sub: userId,
        id: userId,
        name: userInfo.nickname,
        picture: userInfo.faceimg,
      },
      secret: process.env.NEXTAUTH_SECRET as string,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Step 5: 设置 session cookie 并重定向到首页
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    cookieStore.set(
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

    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器内部错误";
    return redirectToLogin(message);
  }
}

function redirectToLogin(error: string) {
  const loginUrl = new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000");
  loginUrl.searchParams.set("error", encodeURIComponent(error));
  return NextResponse.redirect(loginUrl);
}
