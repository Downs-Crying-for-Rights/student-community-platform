import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { DEFAULT_HOME_HERO, type HomeHeroConfig } from "@/lib/home-content-config";

export { DEFAULT_HOME_HERO } from "@/lib/home-content-config";
export type { HomeHeroConfig, HomeHeroLink } from "@/lib/home-content-config";

export function parseHomeHeroLinks(value: Prisma.JsonValue | null | undefined): HomeHeroConfig["links"] {
  if (!Array.isArray(value) || value.length !== 3) return DEFAULT_HOME_HERO.links;
  const links = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const label = "label" in item && typeof item.label === "string" ? item.label : "";
    const href = "href" in item && typeof item.href === "string" ? item.href : "";
    return label && href.startsWith("/") && !href.startsWith("//") ? { label, href } : null;
  });
  return links.every(Boolean) ? links as HomeHeroConfig["links"] : DEFAULT_HOME_HERO.links;
}

export async function getHomeHeroConfig(): Promise<HomeHeroConfig> {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: { homeHeroTitle: true, homeHeroDescription: true, homeHeroLinks: true },
  });
  return {
    title: config?.homeHeroTitle || DEFAULT_HOME_HERO.title,
    description: config?.homeHeroDescription || DEFAULT_HOME_HERO.description,
    links: parseHomeHeroLinks(config?.homeHeroLinks),
  };
}
