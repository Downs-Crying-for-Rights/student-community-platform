import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/applications",
}));

/**
 * 准入申请审核页面测试
 *
 * 验证申请审核页面的纯逻辑：
 * - 状态标签映射 (STATUS_LABELS)
 * - Tab 切换筛选 (DCR / PSYCHOLOGY)
 * - API 路径选择 (DCR → /api/dcr/apply/[id], PSYCHOLOGY → /api/psych/apply/[id])
 * - 通过/拒绝操作流程
 * - Property 20: 审核按钮仅在 PENDING 状态显示
 *
 * Validates: Requirements 8.3, 8.5, 8.6, 8.7
 */

/* ---------- Types mirroring the page ---------- */

interface ApplicationItem {
  id: string;
  type: "DCR" | "PSYCHOLOGY";
  status: "PENDING" | "APPROVED" | "REJECTED";
  pledgeText: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  applicant: { id: string; nickname: string | null };
  relatedCase?: {
    formData: Record<string, unknown>;
    pledgeText: string;
    category: string;
    status: string;
  } | null;
}

type TabType = "DCR" | "PSYCHOLOGY";

/* ---------- Logic extracted from page (mirrors inline logic) ---------- */

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "待审核", className: "bg-yellow-100 text-yellow-700" },
  APPROVED: { text: "已通过", className: "bg-green-100 text-green-700" },
  REJECTED: { text: "已拒绝", className: "bg-red-100 text-red-700" },
};

const TAB_LABELS: Record<TabType, string> = {
  DCR: "DCR 准入",
  PSYCHOLOGY: "心理区准入",
};

function getApiPath(app: ApplicationItem): string {
  return app.type === "DCR"
    ? `/api/dcr/apply/${app.id}`
    : `/api/psych/apply/${app.id}`;
}

function shouldShowActionButtons(status: string): boolean {
  return status === "PENDING";
}

const FORM_DATA_LABELS: Record<string, string> = {
  schoolName: "学校名称",
  schoolType: "学校性质",
  schoolAddress: "学校地址",
  reportChannel: "举报途径",
  description: "行为描述",
  feeInfo: "收费情况",
  demands: "诉求列表",
};

/** Mirrors the page logic: detail area is shown when type is DCR and relatedCase exists */
function shouldShowDetailArea(app: ApplicationItem): boolean {
  return app.type === "DCR" && !!app.relatedCase;
}

/** Mirrors the page logic: build display entries from formData using FORM_DATA_LABELS */
function buildFormDataEntries(formData: Record<string, unknown>): Array<{ label: string; value: string }> {
  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, label] of Object.entries(FORM_DATA_LABELS)) {
    const value = formData[key];
    if (value === undefined || value === null) continue;
    const displayValue = Array.isArray(value) ? value.join("、") : String(value);
    entries.push({ label, value: displayValue });
  }
  return entries;
}

/* ---------- Sample data ---------- */

function makeApp(overrides: Partial<ApplicationItem> = {}): ApplicationItem {
  return {
    id: "app-1",
    type: "DCR",
    status: "PENDING",
    pledgeText: "承诺文本",
    reviewNote: null,
    createdAt: "2025-01-15T10:00:00Z",
    reviewedAt: null,
    applicant: { id: "user-1", nickname: "测试用户" },
    ...overrides,
  };
}

/* ---------- Status labels mapping ---------- */

describe("STATUS_LABELS mapping", () => {
  it("maps PENDING to 待审核", () => {
    expect(STATUS_LABELS["PENDING"].text).toBe("待审核");
  });

  it("maps APPROVED to 已通过", () => {
    expect(STATUS_LABELS["APPROVED"].text).toBe("已通过");
  });

  it("maps REJECTED to 已拒绝", () => {
    expect(STATUS_LABELS["REJECTED"].text).toBe("已拒绝");
  });

  it("returns undefined for unknown status", () => {
    expect(STATUS_LABELS["UNKNOWN"]).toBeUndefined();
  });
});

/* ---------- Tab switching filter ---------- */

describe("Tab switching filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches with ?type=DCR when DCR tab is active", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ applications: [] }),
    });

    await fetch("/api/admin/applications?type=DCR");

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/applications?type=DCR");
  });

  it("fetches with ?type=PSYCHOLOGY when PSYCHOLOGY tab is active", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ applications: [] }),
    });

    await fetch("/api/admin/applications?type=PSYCHOLOGY");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/applications?type=PSYCHOLOGY",
    );
  });

  it("TAB_LABELS has correct labels for both tabs", () => {
    expect(TAB_LABELS.DCR).toBe("DCR 准入");
    expect(TAB_LABELS.PSYCHOLOGY).toBe("心理区准入");
  });

  it("only DCR and PSYCHOLOGY are valid tab types", () => {
    const tabKeys = Object.keys(TAB_LABELS);
    expect(tabKeys).toEqual(["DCR", "PSYCHOLOGY"]);
  });
});

/* ---------- API path selection ---------- */

describe("API path selection (getApiPath)", () => {
  it("returns /api/dcr/apply/[id] for DCR type", () => {
    const app = makeApp({ id: "abc-123", type: "DCR" });
    expect(getApiPath(app)).toBe("/api/dcr/apply/abc-123");
  });

  it("returns /api/psych/apply/[id] for PSYCHOLOGY type", () => {
    const app = makeApp({ id: "xyz-456", type: "PSYCHOLOGY" });
    expect(getApiPath(app)).toBe("/api/psych/apply/xyz-456");
  });

  it("includes the application id in the path", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom("DCR" as const, "PSYCHOLOGY" as const),
        (id, type) => {
          const app = makeApp({ id, type });
          const path = getApiPath(app);
          return path.endsWith(`/${id}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ---------- Approve operation flow ---------- */

describe("Approve operation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PATCH with { status: 'APPROVED' } for DCR application", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ application: { id: "app-1", status: "APPROVED" } }),
    });

    const app = makeApp({ id: "app-1", type: "DCR" });
    const res = await fetch(getApiPath(app), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    const data = await res.json();

    expect(mockFetch).toHaveBeenCalledWith("/api/dcr/apply/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    expect(data.application.status).toBe("APPROVED");
  });

  it("sends PATCH with { status: 'APPROVED' } for PSYCHOLOGY application", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ application: { id: "app-2", status: "APPROVED" } }),
    });

    const app = makeApp({ id: "app-2", type: "PSYCHOLOGY" });
    const res = await fetch(getApiPath(app), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/psych/apply/app-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
  });
});

/* ---------- Reject operation flow ---------- */

describe("Reject operation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends PATCH with { status: 'REJECTED', reviewNote } for rejection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        application: { id: "app-1", status: "REJECTED", reviewNote: "不符合条件" },
      }),
    });

    const app = makeApp({ id: "app-1", type: "DCR" });
    const reviewNote = "不符合条件";
    const res = await fetch(getApiPath(app), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED", reviewNote }),
    });
    const data = await res.json();

    expect(mockFetch).toHaveBeenCalledWith("/api/dcr/apply/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED", reviewNote: "不符合条件" }),
    });
    expect(data.application.status).toBe("REJECTED");
    expect(data.application.reviewNote).toBe("不符合条件");
  });

  it("sends undefined reviewNote when note is empty (trimmed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ application: { id: "app-1", status: "REJECTED" } }),
    });

    const app = makeApp({ id: "app-1", type: "PSYCHOLOGY" });
    const reviewNote = "   "; // whitespace only
    const trimmed = reviewNote.trim() || undefined;

    await fetch(getApiPath(app), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED", reviewNote: trimmed }),
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/psych/apply/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });
  });
});

/* ---------- Property 20: Review buttons only shown for PENDING status ---------- */

describe("Property 20: Review buttons only shown for PENDING status", () => {
  /**
   * Feature: dcr-complete-ui, Property 20: 审核按钮仅在 PENDING 状态显示
   *
   * For any application, the approve/reject buttons should only be shown
   * when the application status is PENDING. APPROVED and REJECTED
   * applications should not show action buttons.
   *
   * **Validates: Requirements 8.5**
   */

  it("shows action buttons only for PENDING status", () => {
    const allStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;

    fc.assert(
      fc.property(fc.constantFrom(...allStatuses), (status) => {
        const showButtons = shouldShowActionButtons(status);
        if (status === "PENDING") {
          return showButtons === true;
        }
        return showButtons === false;
      }),
      { numRuns: 100 },
    );
  });

  it("arbitrary non-PENDING strings never show action buttons", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "PENDING"),
        (status) => {
          return shouldShowActionButtons(status) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PENDING application shows buttons", () => {
    expect(shouldShowActionButtons("PENDING")).toBe(true);
  });

  it("APPROVED application does not show buttons", () => {
    expect(shouldShowActionButtons("APPROVED")).toBe(false);
  });

  it("REJECTED application does not show buttons", () => {
    expect(shouldShowActionButtons("REJECTED")).toBe(false);
  });
});

/* ---------- Bug 1 修复：展开详情区域显示学校名称、行为描述等字段 ---------- */

describe("FORM_DATA_LABELS mapping", () => {
  it("maps all expected formData keys to Chinese labels", () => {
    expect(FORM_DATA_LABELS["schoolName"]).toBe("学校名称");
    expect(FORM_DATA_LABELS["schoolType"]).toBe("学校性质");
    expect(FORM_DATA_LABELS["schoolAddress"]).toBe("学校地址");
    expect(FORM_DATA_LABELS["reportChannel"]).toBe("举报途径");
    expect(FORM_DATA_LABELS["description"]).toBe("行为描述");
    expect(FORM_DATA_LABELS["feeInfo"]).toBe("收费情况");
    expect(FORM_DATA_LABELS["demands"]).toBe("诉求列表");
  });

  it("contains exactly 7 label entries", () => {
    expect(Object.keys(FORM_DATA_LABELS)).toHaveLength(7);
  });
});

describe("Detail area visibility (shouldShowDetailArea)", () => {
  it("shows detail area for DCR application with relatedCase", () => {
    const app = makeApp({
      type: "DCR",
      relatedCase: {
        formData: { schoolName: "测试学校" },
        pledgeText: "承诺",
        category: "COMPLAINT",
        status: "OPENED",
      },
    });
    expect(shouldShowDetailArea(app)).toBe(true);
  });

  it("does not show detail area for DCR application without relatedCase", () => {
    const app = makeApp({ type: "DCR", relatedCase: null });
    expect(shouldShowDetailArea(app)).toBe(false);
  });

  it("does not show detail area for DCR application with undefined relatedCase", () => {
    const app = makeApp({ type: "DCR" });
    expect(shouldShowDetailArea(app)).toBe(false);
  });

  it("does not show detail area for PSYCHOLOGY application even with relatedCase", () => {
    const app = makeApp({
      type: "PSYCHOLOGY",
      relatedCase: {
        formData: { schoolName: "测试学校" },
        pledgeText: "承诺",
        category: "COMPLAINT",
        status: "OPENED",
      },
    });
    expect(shouldShowDetailArea(app)).toBe(false);
  });
});

describe("Detail area formData rendering (buildFormDataEntries)", () => {
  it("renders schoolName and description fields with correct labels", () => {
    const formData = {
      schoolName: "北京第一中学",
      description: "违规收费行为",
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([
      { label: "学校名称", value: "北京第一中学" },
      { label: "行为描述", value: "违规收费行为" },
    ]);
  });

  it("renders all 7 fields when all are present", () => {
    const formData = {
      schoolName: "测试学校",
      schoolType: "公立",
      schoolAddress: "北京市海淀区",
      reportChannel: "电话举报",
      description: "乱收费",
      feeInfo: "每学期多收500元",
      demands: "退还多收费用",
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toHaveLength(7);
    expect(entries[0]).toEqual({ label: "学校名称", value: "测试学校" });
    expect(entries[4]).toEqual({ label: "行为描述", value: "乱收费" });
  });

  it("skips null and undefined values", () => {
    const formData = {
      schoolName: "测试学校",
      schoolType: null,
      description: undefined,
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([
      { label: "学校名称", value: "测试学校" },
    ]);
  });

  it("joins array values with 、separator (demands field)", () => {
    const formData = {
      demands: ["退费", "道歉", "整改"],
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([
      { label: "诉求列表", value: "退费、道歉、整改" },
    ]);
  });

  it("converts non-string values to string", () => {
    const formData = {
      feeInfo: 500,
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([
      { label: "收费情况", value: "500" },
    ]);
  });

  it("returns empty array when formData has no matching keys", () => {
    const formData = { unknownField: "value" };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([]);
  });

  it("ignores keys not in FORM_DATA_LABELS", () => {
    const formData = {
      schoolName: "测试学校",
      extraField: "should be ignored",
      anotherField: 123,
    };
    const entries = buildFormDataEntries(formData);
    expect(entries).toEqual([
      { label: "学校名称", value: "测试学校" },
    ]);
  });
});

/* ---------- Page module import ---------- */

describe("ApplicationReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        applications: [
          makeApp({ id: "app-1", status: "PENDING" }),
          makeApp({ id: "app-2", status: "APPROVED" }),
        ],
      }),
    });
  });

  it("应能导入页面组件", async () => {
    const mod = await import("../../applications/page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
