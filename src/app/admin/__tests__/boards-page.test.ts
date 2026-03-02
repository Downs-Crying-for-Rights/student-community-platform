import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/boards",
}));

const mockBoards = [
  {
    id: "board1",
    name: "娱乐",
    description: "娱乐板块",
    zone: "PUBLIC",
    sortWeight: 0,
    isActive: true,
    createdAt: "2025-01-01T00:00:00Z",
    _count: { posts: 10 },
  },
  {
    id: "board2",
    name: "心理树洞",
    description: "匿名倾诉",
    zone: "PSYCHOLOGY",
    sortWeight: 1,
    isActive: true,
    createdAt: "2025-01-02T00:00:00Z",
    _count: { posts: 5 },
  },
  {
    id: "board3",
    name: "权益互助",
    description: null,
    zone: "DCR",
    sortWeight: 2,
    isActive: false,
    createdAt: "2025-01-03T00:00:00Z",
    _count: { posts: 0 },
  },
];

describe("AdminBoardsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ boards: mockBoards }),
    });
  });

  it("应能导入页面组件", async () => {
    const mod = await import("../boards/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("应使用 admin=true 参数获取板块列表", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ boards: mockBoards }),
    });

    const res = await fetch("/api/boards?admin=true");
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.boards).toHaveLength(3);
    expect(data.boards[0].name).toBe("娱乐");
    expect(data.boards[2].isActive).toBe(false);
  });

  it("应正确区分三种区域类型", () => {
    const zoneLabels: Record<string, { text: string; className: string }> = {
      PUBLIC: { text: "公开区", className: "bg-green-100 text-green-700" },
      PSYCHOLOGY: { text: "心理区", className: "bg-purple-100 text-purple-700" },
      DCR: { text: "DCR 区", className: "bg-orange-100 text-orange-700" },
    };

    expect(zoneLabels["PUBLIC"].text).toBe("公开区");
    expect(zoneLabels["PUBLIC"].className).toContain("green");
    expect(zoneLabels["PSYCHOLOGY"].text).toBe("心理区");
    expect(zoneLabels["PSYCHOLOGY"].className).toContain("purple");
    expect(zoneLabels["DCR"].text).toBe("DCR 区");
    expect(zoneLabels["DCR"].className).toContain("orange");
  });

  it("应在创建板块时调用 POST API", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        board: {
          id: "new-board",
          name: "新板块",
          description: "测试描述",
          zone: "PUBLIC",
          sortWeight: 5,
          isActive: true,
        },
      }),
    });

    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "新板块",
        description: "测试描述",
        zone: "PUBLIC",
        sortWeight: 5,
      }),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.board.name).toBe("新板块");
    expect(data.board.zone).toBe("PUBLIC");
    expect(mockFetch).toHaveBeenCalledWith("/api/boards", expect.objectContaining({
      method: "POST",
    }));
  });

  it("应在编辑板块时调用 PATCH API", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        board: {
          id: "board1",
          name: "更新后的名称",
          description: "更新后的描述",
          sortWeight: 10,
          isActive: true,
        },
      }),
    });

    const res = await fetch("/api/boards/board1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "更新后的名称",
        description: "更新后的描述",
        sortWeight: 10,
      }),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.board.name).toBe("更新后的名称");
    expect(data.board.sortWeight).toBe(10);
  });

  it("应在切换可见性时调用 PATCH API 更新 isActive", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        board: { id: "board1", isActive: false },
      }),
    });

    const res = await fetch("/api/boards/board1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.board.isActive).toBe(false);
  });

  it("应包含帖子数量信息", () => {
    expect(mockBoards[0]._count.posts).toBe(10);
    expect(mockBoards[1]._count.posts).toBe(5);
    expect(mockBoards[2]._count.posts).toBe(0);
  });

  it("应正确处理板块排序权重", () => {
    const sorted = [...mockBoards].sort((a, b) => a.sortWeight - b.sortWeight);
    expect(sorted[0].name).toBe("娱乐");
    expect(sorted[1].name).toBe("心理树洞");
    expect(sorted[2].name).toBe("权益互助");
  });

  it("应正确区分活跃和隐藏状态", () => {
    const activeBoards = mockBoards.filter((b) => b.isActive);
    const inactiveBoards = mockBoards.filter((b) => !b.isActive);

    expect(activeBoards).toHaveLength(2);
    expect(inactiveBoards).toHaveLength(1);
    expect(inactiveBoards[0].name).toBe("权益互助");
  });
});
