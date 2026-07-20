export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.3.0",
    date: "2026-07-20",
    title: "公告与内容运营",
    changes: [
      "新增全站强制弹窗公告和公告确认记录。",
      "新增平台公告私信群发、分批投递、失败重试和系统通知。",
      "新增管理员帖子置顶、自动取消置顶和置顶审计。",
      "新增后台公告投递进度与历史公告管理。",
    ],
  },
  {
    version: "0.2.98",
    date: "2026-07-20",
    title: "注册安全与委托表完善",
    changes: [
      "注册统一强制手机号短信验证，移除手机号验证码登录。",
      "邮箱魔法链接和 QQ 登录不再自动创建未验证账号。",
      "登录协议改为站内 Markdown 弹窗。",
      "委托表风险偏好改为独立必填，QQ 委托同步校验。",
    ],
  },
  {
    version: "0.2.97",
    date: "2026-07-20",
    title: "首页与站点内容管理",
    changes: [
      "首页标题、说明及三个站内按钮支持后台配置。",
      "社区规范迁入 Markdown 站点内容管理。",
      "首页配置和社区规范读取增加安全回退。",
    ],
  },
  {
    version: "0.2.96",
    date: "2026-07-20",
    title: "短信认证与资料补全",
    changes: [
      "接入阿里云号码认证短信验证码。",
      "新增密码重置、手机号绑定与短信策略后台配置。",
      "新账号强制补齐昵称、头像和 QQ 号。",
    ],
  },
];
