import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_HERO, parseHomeHeroLinks } from "@/lib/home-content";
import { isHomeHeroConfig } from "@/lib/home-content-config";

describe("home content", () => {
  it("accepts exactly three internal links", () => {
    const links = [
      { label: "甲", href: "/one" },
      { label: "乙", href: "/two?tab=1" },
      { label: "丙", href: "/three" },
    ];
    expect(parseHomeHeroLinks(links)).toEqual(links);
  });

  it("falls back for external, protocol-relative, or malformed links", () => {
    expect(parseHomeHeroLinks([{ label: "外链", href: "https://example.com" }])).toEqual(DEFAULT_HOME_HERO.links);
    expect(parseHomeHeroLinks([
      { label: "甲", href: "/one" },
      { label: "乙", href: "//example.com" },
      { label: "丙", href: "/three" },
    ])).toEqual(DEFAULT_HOME_HERO.links);
  });

  it("validates the complete client hero payload before rendering indexed links", () => {
    expect(isHomeHeroConfig(DEFAULT_HOME_HERO)).toBe(true);
    expect(isHomeHeroConfig({ ...DEFAULT_HOME_HERO, links: DEFAULT_HOME_HERO.links.slice(0, 2) })).toBe(false);
    expect(isHomeHeroConfig({ ...DEFAULT_HOME_HERO, links: [
      DEFAULT_HOME_HERO.links[0],
      DEFAULT_HOME_HERO.links[1],
      { label: "外链", href: "//example.com" },
    ] })).toBe(false);
  });
});
