import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UserAvatar } from "@/components/shared/UserAvatar";

describe("UserAvatar", () => {
  it("shows a bottom-right check for a verified user", () => {
    const html = renderToStaticMarkup(<UserAvatar src="https://example.com/avatar.png" name="用户" isVerified />);
    expect(html).toContain("已认证");
    expect(html).toContain("bottom-0 right-0");
  });

  it("shows the check on a verified fallback avatar", () => {
    expect(renderToStaticMarkup(<UserAvatar name="用户" isVerified />)).toContain("已认证");
  });

  it("never exposes verification on an anonymous avatar", () => {
    expect(renderToStaticMarkup(<UserAvatar name="匿名用户" isVerified anonymous />)).not.toContain("已认证");
  });
});
