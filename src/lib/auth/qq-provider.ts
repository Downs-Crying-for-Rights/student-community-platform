import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import type { Profile } from "next-auth";

/**
 * QQ OAuth 2.0 用户资料
 */
export interface QQProfile {
  openid: string;
  nickname: string;
  figureurl_qq_2: string; // 100x100 头像 URL
}

/**
 * 解析 QQ 非标准 callback 格式响应
 * QQ 返回格式: callback( {"client_id":"APP_ID","openid":"OPENID"} );
 */
export function parseCallbackResponse(text: string): Record<string, unknown> {
  const match = text.match(/callback\(\s*(\{[\s\S]*?\})\s*\)/);
  if (!match?.[1]) {
    throw new Error("Failed to parse QQ callback response");
  }
  return JSON.parse(match[1]);
}

/**
 * 自定义 QQ OAuth Provider for NextAuth v4
 *
 * QQ OAuth 2.0 端点：
 * - 授权: https://graph.qq.com/oauth2.0/authorize
 * - Token: https://graph.qq.com/oauth2.0/token
 * - OpenID: https://graph.qq.com/oauth2.0/me
 * - 用户信息: https://graph.qq.com/user/get_user_info
 */
export default function QQProvider(
  options: OAuthUserConfig<QQProfile>
): OAuthConfig<QQProfile> {
  const clientId = options.clientId ?? process.env.QQ_APP_ID ?? "";
  const clientSecret = options.clientSecret ?? process.env.QQ_APP_SECRET ?? "";

  return {
    id: "qq",
    name: "QQ",
    type: "oauth",
    authorization: {
      url: "https://graph.qq.com/oauth2.0/authorize",
      params: {
        response_type: "code",
        scope: "get_user_info",
      },
    },
    token: {
      url: "https://graph.qq.com/oauth2.0/token",
      async request({ params }) {
        // QQ token endpoint returns non-standard format:
        // access_token=TOKEN&expires_in=7776000&refresh_token=REFRESH
        const url = new URL("https://graph.qq.com/oauth2.0/token");
        url.searchParams.set("grant_type", "authorization_code");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("client_secret", clientSecret);
        url.searchParams.set("code", params.code as string);
        url.searchParams.set("redirect_uri", params.redirect_uri as string);
        url.searchParams.set("fmt", "json");

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error) {
          throw new Error(
            `QQ token error: ${data.error} - ${data.error_description}`
          );
        }

        return {
          tokens: {
            access_token: data.access_token,
            expires_in: data.expires_in,
            refresh_token: data.refresh_token,
            token_type: "Bearer",
          },
        };
      },
    },
    userinfo: {
      async request({ tokens }) {
        const accessToken = tokens.access_token;

        // Step 1: Get openid from /oauth2.0/me
        const meUrl = new URL("https://graph.qq.com/oauth2.0/me");
        meUrl.searchParams.set("access_token", accessToken as string);
        meUrl.searchParams.set("fmt", "json");

        const meResponse = await fetch(meUrl.toString());
        const meText = await meResponse.text();

        let meData: Record<string, unknown>;
        try {
          // Try JSON first (when fmt=json is supported)
          meData = JSON.parse(meText);
        } catch {
          // Fallback: parse QQ callback format
          meData = parseCallbackResponse(meText);
        }

        if (meData.error) {
          throw new Error(`QQ openid error: ${meData.error}`);
        }

        const openid = meData.openid as string;

        // Step 2: Get user info from /user/get_user_info
        const userInfoUrl = new URL(
          "https://graph.qq.com/user/get_user_info"
        );
        userInfoUrl.searchParams.set("access_token", accessToken as string);
        userInfoUrl.searchParams.set("oauth_consumer_key", clientId);
        userInfoUrl.searchParams.set("openid", openid);

        const userInfoResponse = await fetch(userInfoUrl.toString());
        const userInfo = await userInfoResponse.json();

        if (userInfo.ret !== 0) {
          throw new Error(`QQ userinfo error: ${userInfo.msg}`);
        }

        return {
          sub: openid,
          name: userInfo.nickname,
          image: userInfo.figureurl_qq_2,
          // Store QQ-specific fields for the profile callback
          openid,
          nickname: userInfo.nickname,
          figureurl_qq_2: userInfo.figureurl_qq_2,
        } as Profile;
      },
    },
    profile(profile: QQProfile) {
      return {
        id: profile.openid,
        name: profile.nickname,
        image: profile.figureurl_qq_2,
        email: null,
      };
    },
    clientId,
    clientSecret,
    options,
  };
}
