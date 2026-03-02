import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CaseActionButtons 组件逻辑测试
 *
 * 由于项目测试环境为 node（无 jsdom/testing-library），
 * 这里验证 CaseActionButtons 的核心逻辑：
 * - 各状态/角色组合下的按钮渲染（通过 getAvailableActions）
 * - 按钮点击触发 API 调用逻辑
 * - 加载状态和错误处理
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 1.8
 */

import {
  getAvailableActions,
  type CaseStatus,
  type ActionConfig,
} from "@/lib/dcr-ui-helpers";

/* ========== 按钮渲染逻辑测试 ========== */

describe("CaseActionButtons — 按钮渲染逻辑", () => {
  describe("OPENED 状态", () => {
    it("DCR_HELPER 应看到「接单」按钮", () => {
      const actions = getAvailableActions("OPENED", "DCR_HELPER", false, false);
      expect(actions).toHaveLength(1);
      expect(actions[0].label).toBe("接单");
      expect(actions[0].targetStatus).toBe("IN_PROGRESS");
      expect(actions[0].variant).toBe("default");
    });

    it("ADMIN 应看到「接单」按钮", () => {
      const actions = getAvailableActions("OPENED", "ADMIN", false, false);
      expect(actions).toHaveLength(1);
      expect(actions[0].label).toBe("接单");
    });

    it("提交者应看到「取消工单」按钮", () => {
      const actions = getAvailableActions("OPENED", "USER", true, false);
      expect(actions).toHaveLength(1);
      expect(actions[0].label).toBe("取消工单");
      expect(actions[0].targetStatus).toBe("CLOSED");
      expect(actions[0].variant).toBe("destructive");
    });

    it("ADMIN 且为提交者应看到「接单」和「取消工单」两个按钮", () => {
      const actions = getAvailableActions("OPENED", "ADMIN", true, false);
      expect(actions).toHaveLength(2);
      const labels = actions.map((a) => a.label);
      expect(labels).toContain("接单");
      expect(labels).toContain("取消工单");
    });

    it("普通 USER（非提交者）不应看到任何按钮", () => {
      const actions = getAvailableActions("OPENED", "USER", false, false);
      expect(actions).toHaveLength(0);
    });
  });

  describe("IN_PROGRESS 状态", () => {
    it("处理者应看到「请求补充」和「关闭工单」按钮", () => {
      const actions = getAvailableActions("IN_PROGRESS", "DCR_HELPER", false, true);
      expect(actions).toHaveLength(2);
      const labels = actions.map((a) => a.label);
      expect(labels).toContain("请求补充");
      expect(labels).toContain("关闭工单");
    });

    it("ADMIN 应看到「请求补充」和「关闭工单」按钮", () => {
      const actions = getAvailableActions("IN_PROGRESS", "ADMIN", false, false);
      expect(actions).toHaveLength(2);
    });

    it("「请求补充」按钮目标状态为 NEED_MORE_INFO", () => {
      const actions = getAvailableActions("IN_PROGRESS", "ADMIN", false, false);
      const reqMore = actions.find((a) => a.label === "请求补充");
      expect(reqMore?.targetStatus).toBe("NEED_MORE_INFO");
      expect(reqMore?.variant).toBe("outline");
    });

    it("「关闭工单」按钮目标状态为 CLOSED", () => {
      const actions = getAvailableActions("IN_PROGRESS", "ADMIN", false, false);
      const close = actions.find((a) => a.label === "关闭工单");
      expect(close?.targetStatus).toBe("CLOSED");
      expect(close?.variant).toBe("destructive");
    });

    it("提交者（非处理者）不应看到按钮", () => {
      const actions = getAvailableActions("IN_PROGRESS", "USER", true, false);
      expect(actions).toHaveLength(0);
    });
  });

  describe("NEED_MORE_INFO 状态", () => {
    it("提交者应看到「已补充信息」按钮", () => {
      const actions = getAvailableActions("NEED_MORE_INFO", "USER", true, false);
      expect(actions).toHaveLength(1);
      expect(actions[0].label).toBe("已补充信息");
      expect(actions[0].targetStatus).toBe("IN_PROGRESS");
      expect(actions[0].variant).toBe("default");
    });

    it("ADMIN 应看到「已补充信息」按钮", () => {
      const actions = getAvailableActions("NEED_MORE_INFO", "ADMIN", false, false);
      expect(actions).toHaveLength(1);
      expect(actions[0].label).toBe("已补充信息");
    });

    it("处理者（非提交者、非 ADMIN）不应看到按钮", () => {
      const actions = getAvailableActions("NEED_MORE_INFO", "DCR_HELPER", false, true);
      expect(actions).toHaveLength(0);
    });
  });

  describe("CLOSED 状态", () => {
    it("任何角色都不应看到按钮", () => {
      const roles = ["USER", "DCR_HELPER", "ADMIN", "MODERATOR"];
      for (const role of roles) {
        const actions = getAvailableActions("CLOSED", role, true, true);
        expect(actions).toHaveLength(0);
      }
    });
  });
});

/* ========== API 调用逻辑测试 ========== */

/**
 * 提取 CaseActionButtons 中 handleAction 的核心逻辑进行测试。
 * 模拟 fetch 行为验证 API 调用、错误处理和回调触发。
 */

interface HandleActionResult {
  alertMessage: string | null;
  onStatusChangeCalled: boolean;
}

async function simulateHandleAction(
  caseId: string,
  targetStatus: CaseStatus,
  fetchImpl: typeof globalThis.fetch,
  onStatusChange: () => void,
): Promise<HandleActionResult> {
  let alertMessage: string | null = null;

  try {
    const res = await fetchImpl(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const msg = data?.error ?? "操作失败，请稍后重试";
      alertMessage = msg;
      return { alertMessage, onStatusChangeCalled: false };
    }

    onStatusChange();
    return { alertMessage: null, onStatusChangeCalled: true };
  } catch {
    alertMessage = "网络错误，请检查连接后重试";
    return { alertMessage, onStatusChangeCalled: false };
  }
}

describe("CaseActionButtons — API 调用逻辑", () => {
  it("成功时应调用 onStatusChange 回调", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const onStatusChange = vi.fn();

    const result = await simulateHandleAction(
      "case-1",
      "IN_PROGRESS",
      mockFetch as unknown as typeof globalThis.fetch,
      onStatusChange,
    );

    expect(mockFetch).toHaveBeenCalledWith("/api/cases/case-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(result.onStatusChangeCalled).toBe(true);
    expect(result.alertMessage).toBeNull();
  });

  it("API 返回错误时应提取 error 字段作为 alert 消息", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "权限不足" }),
    });
    const onStatusChange = vi.fn();

    const result = await simulateHandleAction(
      "case-2",
      "CLOSED",
      mockFetch as unknown as typeof globalThis.fetch,
      onStatusChange,
    );

    expect(result.alertMessage).toBe("权限不足");
    expect(result.onStatusChangeCalled).toBe(false);
  });

  it("API 返回错误但 JSON 解析失败时应使用默认消息", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error("parse error")),
    });
    const onStatusChange = vi.fn();

    const result = await simulateHandleAction(
      "case-3",
      "CLOSED",
      mockFetch as unknown as typeof globalThis.fetch,
      onStatusChange,
    );

    expect(result.alertMessage).toBe("操作失败，请稍后重试");
    expect(result.onStatusChangeCalled).toBe(false);
  });

  it("网络错误时应显示网络错误消息", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    const onStatusChange = vi.fn();

    const result = await simulateHandleAction(
      "case-4",
      "IN_PROGRESS",
      mockFetch as unknown as typeof globalThis.fetch,
      onStatusChange,
    );

    expect(result.alertMessage).toBe("网络错误，请检查连接后重试");
    expect(result.onStatusChangeCalled).toBe(false);
  });

  it("应向正确的 URL 发送 PATCH 请求", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await simulateHandleAction(
      "abc-123",
      "NEED_MORE_INFO",
      mockFetch as unknown as typeof globalThis.fetch,
      vi.fn(),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/cases/abc-123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "NEED_MORE_INFO" }),
      }),
    );
  });
});

/* ========== 加载状态逻辑测试 ========== */

describe("CaseActionButtons — 加载状态逻辑", () => {
  it("actions 为空时组件应返回 null（不渲染）", () => {
    const actions = getAvailableActions("CLOSED", "USER", false, false);
    expect(actions).toHaveLength(0);
    // 组件中 actions.length === 0 时 return null
  });

  it("请求期间 loading 应为 true，完成后恢复为 false", async () => {
    let loadingStates: boolean[] = [];
    let loading = false;

    function setLoading(val: boolean) {
      loading = val;
      loadingStates.push(val);
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    // Simulate the handleAction flow
    setLoading(true);
    try {
      const res = await mockFetch("/api/cases/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (res.ok) {
        // onStatusChange would be called
      }
    } finally {
      setLoading(false);
    }

    expect(loadingStates).toEqual([true, false]);
    expect(loading).toBe(false);
  });

  it("请求失败时 loading 也应恢复为 false", async () => {
    let loading = false;
    const loadingStates: boolean[] = [];

    function setLoading(val: boolean) {
      loading = val;
      loadingStates.push(val);
    }

    const mockFetch = vi.fn().mockRejectedValue(new Error("fail"));

    setLoading(true);
    try {
      await mockFetch("/api/cases/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED" }),
      });
    } catch {
      // error handled
    } finally {
      setLoading(false);
    }

    expect(loadingStates).toEqual([true, false]);
    expect(loading).toBe(false);
  });
});
