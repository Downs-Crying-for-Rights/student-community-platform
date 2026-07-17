import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { POST } from "../confide/route";

function request() {
  return new NextRequest("http://localhost:3000/api/psych/confide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary: "需要倾诉的测试内容" }),
  });
}

describe("POST /api/psych/confide", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登录时返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(request(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("暂停期间不创建新请求并返回 503", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user1", role: "USER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const res = await POST(request(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain("暂时关闭");
    expect(data.next).toBe("/psych#resources");
  });
});
