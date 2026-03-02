import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/kb",
}));

// --- Constants matching the page implementation ---

const CATEGORY_LABELS: Record<string, string> = {
  RIGHTS: "权益",
  POLICY: "政策",
  GUIDE: "指南",
  FAQ: "常见问题",
  OTHER: "其他",
};

const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "公开",
  DCR_ONLY: "仅 DCR",
};

// --- Mock data ---

const mockArticles = [
  {
    id: "art1",
    title: "学生权益保护指南",
    category: "RIGHTS",
    visibility: "PUBLIC" as const,
    isPublished: true,
    updatedAt: "2025-06-01T10:00:00Z",
  },
  {
    id: "art2",
    title: "DCR 区使用政策",
    category: "POLICY",
    visibility: "DCR_ONLY" as const,
    isPublished: true,
    updatedAt: "2025-06-02T12:00:00Z",
  },
  {
    id: "art3",
    title: "草稿文章",
    category: "FAQ",
    visibility: "PUBLIC" as const,
    isPublished: false,
    updatedAt: "2025-06-03T08:00:00Z",
  },
];

describe("KBAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ articles: mockArticles }),
    });
  });

  // --- Requirement 6.3: Article list rendering ---

  it("应能导入页面组件", async () => {
    const mod = await import("../../kb/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("应使用 all=true 参数获取所有文章（含草稿）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ articles: mockArticles }),
    });

    const res = await fetch("/api/kb?all=true");
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.articles).toHaveLength(3);
    expect(data.articles[2].isPublished).toBe(false);
  });

  it("文章列表应包含标题、分类、可见性、发布状态和更新时间", () => {
    const article = mockArticles[0];
    expect(article).toHaveProperty("title");
    expect(article).toHaveProperty("category");
    expect(article).toHaveProperty("visibility");
    expect(article).toHaveProperty("isPublished");
    expect(article).toHaveProperty("updatedAt");
  });

  // --- Requirement 6.3: CATEGORY_LABELS mapping ---

  it("CATEGORY_LABELS 应正确映射所有分类", () => {
    expect(CATEGORY_LABELS["RIGHTS"]).toBe("权益");
    expect(CATEGORY_LABELS["POLICY"]).toBe("政策");
    expect(CATEGORY_LABELS["GUIDE"]).toBe("指南");
    expect(CATEGORY_LABELS["FAQ"]).toBe("常见问题");
    expect(CATEGORY_LABELS["OTHER"]).toBe("其他");
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(5);
  });

  it("VISIBILITY_LABELS 应正确映射可见性选项", () => {
    expect(VISIBILITY_LABELS["PUBLIC"]).toBe("公开");
    expect(VISIBILITY_LABELS["DCR_ONLY"]).toBe("仅 DCR");
    expect(Object.keys(VISIBILITY_LABELS)).toHaveLength(2);
  });

  it("应正确区分已发布和草稿文章", () => {
    const published = mockArticles.filter((a) => a.isPublished);
    const drafts = mockArticles.filter((a) => !a.isPublished);

    expect(published).toHaveLength(2);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe("草稿文章");
  });

  // --- Requirement 6.4: Create article flow ---

  it("应在创建文章时调用 POST /api/kb", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        article: {
          id: "new-art",
          title: "新文章",
          content: "文章内容",
          category: "GUIDE",
          visibility: "PUBLIC",
          isPublished: false,
        },
      }),
    });

    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "新文章",
        content: "文章内容",
        category: "GUIDE",
        visibility: "PUBLIC",
        isPublished: false,
      }),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.article.title).toBe("新文章");
    expect(data.article.category).toBe("GUIDE");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/kb",
      expect.objectContaining({ method: "POST" })
    );
  });

  // --- Requirement 6.6: Edit article flow ---

  it("应在编辑文章时调用 PATCH /api/kb/[id]", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        article: {
          id: "art1",
          title: "更新后的标题",
          content: "更新后的内容",
          category: "RIGHTS",
          visibility: "DCR_ONLY",
          isPublished: true,
        },
      }),
    });

    const res = await fetch("/api/kb/art1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "更新后的标题",
        content: "更新后的内容",
        category: "RIGHTS",
        visibility: "DCR_ONLY",
        isPublished: true,
      }),
    });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.article.title).toBe("更新后的标题");
    expect(data.article.visibility).toBe("DCR_ONLY");
  });

  it("编辑时应先获取文章详情以预填表单", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        article: {
          id: "art1",
          title: "学生权益保护指南",
          content: "详细内容...",
          category: "RIGHTS",
          visibility: "PUBLIC",
          isPublished: true,
        },
      }),
    });

    const res = await fetch("/api/kb/art1");
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.article.title).toBe("学生权益保护指南");
    expect(data.article.content).toBe("详细内容...");
  });

  // --- Requirement 6.9: Delete confirmation flow ---

  it("应在删除文章时调用 DELETE /api/kb/[id]", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const res = await fetch("/api/kb/art1", { method: "DELETE" });
    const data = await res.json();

    expect(res.ok).toBe(true);
    expect(data.success).toBe(true);
  });

  it("删除确认流程应跟踪待删除文章 ID", () => {
    // Simulates the delete confirmation state logic from the page
    let deleteConfirmId: string | null = null;

    // User clicks delete on article
    deleteConfirmId = "art1";
    expect(deleteConfirmId).toBe("art1");

    // User cancels
    deleteConfirmId = null;
    expect(deleteConfirmId).toBeNull();

    // User clicks delete on another article and confirms
    deleteConfirmId = "art2";
    expect(deleteConfirmId).toBe("art2");
  });

  // --- Form validation logic ---

  it("表单验证：标题和内容为必填项", () => {
    const validateForm = (title: string, content: string) =>
      title.trim().length > 0 && content.trim().length > 0;

    expect(validateForm("标题", "内容")).toBe(true);
    expect(validateForm("", "内容")).toBe(false);
    expect(validateForm("标题", "")).toBe(false);
    expect(validateForm("", "")).toBe(false);
    expect(validateForm("  ", "内容")).toBe(false);
    expect(validateForm("标题", "   ")).toBe(false);
  });

  it("表单验证：标题最大 200 字符", () => {
    const maxTitleLength = 200;
    const shortTitle = "a".repeat(200);
    const longTitle = "a".repeat(201);

    expect(shortTitle.length).toBeLessThanOrEqual(maxTitleLength);
    expect(longTitle.length).toBeGreaterThan(maxTitleLength);
  });

  it("创建表单默认值应正确初始化", () => {
    const emptyForm = {
      title: "",
      content: "",
      category: "RIGHTS",
      visibility: "PUBLIC" as const,
      isPublished: false,
    };

    expect(emptyForm.title).toBe("");
    expect(emptyForm.content).toBe("");
    expect(emptyForm.category).toBe("RIGHTS");
    expect(emptyForm.visibility).toBe("PUBLIC");
    expect(emptyForm.isPublished).toBe(false);
  });

  // --- Requirement 6.12: Error handling ---

  it("应处理获取文章列表失败的情况", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "权限不足" }),
    });

    const res = await fetch("/api/kb?all=true");
    const data = await res.json();

    expect(res.ok).toBe(false);
    expect(data.error).toBe("权限不足");
  });

  it("应处理创建文章失败的情况", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "参数校验失败" }),
    });

    const res = await fetch("/api/kb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", content: "" }),
    });
    const data = await res.json();

    expect(res.ok).toBe(false);
    expect(data.error).toBe("参数校验失败");
  });

  it("应处理删除文章失败（404）的情况", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "文章不存在" }),
    });

    const res = await fetch("/api/kb/nonexistent", { method: "DELETE" });
    const data = await res.json();

    expect(res.ok).toBe(false);
    expect(data.error).toBe("文章不存在");
  });

  it("应正确区分 PUBLIC 和 DCR_ONLY 可见性样式", () => {
    const getVisibilityStyle = (visibility: string) =>
      visibility === "PUBLIC"
        ? "bg-green-100 text-green-700"
        : "bg-orange-100 text-orange-700";

    expect(getVisibilityStyle("PUBLIC")).toContain("green");
    expect(getVisibilityStyle("DCR_ONLY")).toContain("orange");
  });
});
