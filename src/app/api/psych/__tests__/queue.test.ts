import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { GET } from "../queue/route";

function request() {
  return new NextRequest("http://localhost:3000/api/psych/queue");
}

describe("GET /api/psych/queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登录时返回 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET(request(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("暂停期间不暴露历史等待队列", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "listener1", role: "USER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);

    const res = await GET(request(), { params: {} });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ queue: [], paused: true });
  });
});
