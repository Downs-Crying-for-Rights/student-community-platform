import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UserAvatar } from "@/components/shared/UserAvatar";

describe("UserAvatar", () => {
  it("renders an image when an avatar URL exists", () => {
    const html = renderToStaticMarkup(<UserAvatar src="https://example.com/avatar.png" name="用户" />);
    expect(html).toContain("avatar.png");
    expect(html).toContain("用户 头像");
  });

  it("renders a fallback when no avatar URL exists", () => {
    expect(renderToStaticMarkup(<UserAvatar name="用户" />)).not.toContain("<img");
  });

  it("never exposes a real avatar for an anonymous user", () => {
    expect(renderToStaticMarkup(<UserAvatar src="https://example.com/avatar.png" name="匿名用户" anonymous />)).not.toContain("avatar.png");
  });

  it("shows an administrator verification mark without exposing it anonymously", () => {
    expect(renderToStaticMarkup(<UserAvatar name="管理员" administratorVerified />)).toContain("平台管理员认证");
    expect(renderToStaticMarkup(<UserAvatar name="管理员" administratorVerified anonymous />)).not.toContain("平台管理员认证");
  });
});
