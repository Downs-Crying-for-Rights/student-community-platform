import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mockGetServerSession = vi.fn();
const mockFindMany = vi.fn();

vi.mock("next-auth/next", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  default: {
    quizQuestion: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

describe("GET /api/onboarding/questions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未登录时返回 401", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("返回后台启用的题目并转换为前端格式", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockFindMany.mockResolvedValue([
      { text: "测试题目一", options: ["A", "B", "C", "D"], answer: 2 },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.questions).toEqual([
      {
        id: 1,
        question: "测试题目一",
        options: ["A", "B", "C", "D"],
        correctIndex: 2,
      },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { text: true, options: true, answer: true },
    });
  });
});
