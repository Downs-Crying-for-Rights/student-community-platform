export interface HomeHeroLink {
  label: string;
  href: string;
}

export interface HomeHeroConfig {
  title: string;
  description: string;
  links: [HomeHeroLink, HomeHeroLink, HomeHeroLink];
}

export const DEFAULT_HOME_HERO: HomeHeroConfig = {
  title: "电子扫盲 · 学习交流",
  description: "学生交流社区 — 从认知开始，拒绝信息差。浏览电子扫盲知识、学术讨论与娱乐分享。",
  links: [
    { label: "知识库", href: "/kb" },
    { label: "发现话题", href: "/discover" },
    { label: "社区规则", href: "/help/policies?document=community-guidelines" },
  ],
};
