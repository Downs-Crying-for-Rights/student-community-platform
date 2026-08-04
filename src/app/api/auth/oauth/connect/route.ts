import { NextResponse } from "next/server";
import { getConnectUrl, SUPPORTED_TYPES, type OAuthType } from "@/lib/oauth-aggregator";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/oauth/connect?type=qq
 * 获取第三方 OAuth 登录跳转地址
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as OAuthType | null;
  const redirectUri = searchParams.get("redirect_uri");

  if (!type) {
    return NextResponse.json({ error: "缺少 type 参数" }, { status: 400 });
  }

  if (!(SUPPORTED_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `不支持的登录方式: ${type}` }, { status: 400 });
  }

  // 默认回调地址为 /api/auth/oauth/callback
  const callbackUrl = redirectUri
    ? new URL(redirectUri, request.url).toString()
    : `${new URL(request.url).origin}/api/auth/oauth/callback`;

  try {
    const data = await getConnectUrl(type, callbackUrl);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取登录地址失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
