import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "../SafeMarkdown";

describe("SafeMarkdown", () => {
  it("renders common Markdown syntax", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown content={"# 标题\n\n- 第一项\n- 第二项\n\n[安全链接](https://example.com)"} />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("<ul");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("drops raw HTML and unsafe link protocols", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown content={'<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[危险链接](javascript:alert(3))'} />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
  });
});
