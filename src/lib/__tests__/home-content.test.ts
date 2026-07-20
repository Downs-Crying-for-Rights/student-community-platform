import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_HERO, parseHomeHeroLinks } from "@/lib/home-content";

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
});
