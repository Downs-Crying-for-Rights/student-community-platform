/**
 * 聚合登录平台 OAuth2 客户端
 * 接口文档: https://u.daib.cn/doc.php
 *
 * 支持 17 种第三方登录: qq, wx, alipay, sina, baidu, douyin, huawei, xiaomi,
 * google, microsoft, facebook, twitter, feishu, wework, dingtalk, gitee, github
 */

const BASE_URL = "https://u.daib.cn/connect.php";

export const SUPPORTED_TYPES = [
  "qq", "wx", "alipay", "sina", "baidu", "douyin",
  "huawei", "xiaomi", "google", "microsoft", "facebook",
  "twitter", "feishu", "wework", "dingtalk", "gitee", "github",
] as const;

export type OAuthType = (typeof SUPPORTED_TYPES)[number];

/** 聚合登录类型的中文名称映射 */
export const OAUTH_TYPE_LABELS: Record<string, string> = {
  qq: "QQ",
  wx: "微信",
  alipay: "支付宝",
  sina: "微博",
  baidu: "百度",
  douyin: "抖音",
  huawei: "华为",
  xiaomi: "小米",
  google: "Google",
  microsoft: "Microsoft",
  facebook: "Facebook",
  twitter: "Twitter",
  feishu: "飞书",
  wework: "企业微信",
  dingtalk: "钉钉",
  gitee: "Gitee",
  github: "GitHub",
};

export interface ConnectResponse {
  code: number;
  msg: string;
  type: string;
  url: string;
  qrcode?: string; // 仅微信和支付宝返回
}

export interface CallbackResponse {
  code: number;
  msg: string;
  type: string;
  social_uid: string;
  access_token: string;
  faceimg: string;
  nickname: string;
  location?: string;
  gender?: string;
  ip?: string;
}

export interface QueryResponse {
  code: number;
  msg: string;
  type: string;
  social_uid: string;
  access_token: string;
  nickname: string;
  faceimg: string;
  location?: string;
  gender?: string;
  ip?: string;
}

function getCredentials() {
  const appid = process.env.OAUTH_AGGREGATOR_APPID;
  const appkey = process.env.OAUTH_AGGREGATOR_APPKEY;
  if (!appid || !appkey) {
    throw new Error("OAUTH_AGGREGATOR_APPID 或 OAUTH_AGGREGATOR_APPKEY 未配置");
  }
  return { appid, appkey };
}

/**
 * Step1: 获取跳转登录地址
 * 返回第三方平台的 OAuth 授权 URL，前端跳转到该地址让用户授权登录
 */
export async function getConnectUrl(
  type: OAuthType,
  redirectUri: string,
): Promise<ConnectResponse> {
  const { appid, appkey } = getCredentials();
  const url = new URL(BASE_URL);
  url.searchParams.set("act", "login");
  url.searchParams.set("appid", appid);
  url.searchParams.set("appkey", appkey);
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_uri", redirectUri);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`聚合登录 connect 请求失败: HTTP ${response.status}`);
  }
  const data: ConnectResponse = await response.json();
  if (data.code !== 0) {
    throw new Error(data.msg || "获取登录地址失败");
  }
  return data;
}

/**
 * Step4: 通过 Authorization Code 获取用户信息
 * 用户在第三方平台授权后回调到我们的页面，携带 code 参数
 */
export async function getUserByCode(
  type: OAuthType,
  code: string,
): Promise<CallbackResponse> {
  const { appid, appkey } = getCredentials();
  const url = new URL(BASE_URL);
  url.searchParams.set("act", "callback");
  url.searchParams.set("appid", appid);
  url.searchParams.set("appkey", appkey);
  url.searchParams.set("type", type);
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`聚合登录 callback 请求失败: HTTP ${response.status}`);
  }
  const data: CallbackResponse = await response.json();
  if (data.code !== 0) {
    throw new Error(data.msg || "获取用户信息失败");
  }
  return data;
}

/**
 * 通过 social_uid 查询用户最新信息
 * 可在用户登录后的任意时间调用
 */
export async function queryUser(
  type: OAuthType,
  socialUid: string,
): Promise<QueryResponse> {
  const { appid, appkey } = getCredentials();
  const url = new URL(BASE_URL);
  url.searchParams.set("act", "query");
  url.searchParams.set("appid", appid);
  url.searchParams.set("appkey", appkey);
  url.searchParams.set("type", type);
  url.searchParams.set("social_uid", socialUid);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`聚合登录 query 请求失败: HTTP ${response.status}`);
  }
  const data: QueryResponse = await response.json();
  if (data.code !== 0) {
    throw new Error(data.msg || "查询用户信息失败");
  }
  return data;
}
