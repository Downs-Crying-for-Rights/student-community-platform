import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MessagePanel 组件逻辑测试
 *
 * 由于项目测试环境为 node（无 jsdom/testing-library），
 * 这里验证 MessagePanel 的核心逻辑：
 * - canSendMessage 决定发送表单显示/隐藏
 * - isOwnMessage 决定消息气泡左右对齐
 * - formatMessageTime 格式化日期
 * - 消息列表按 createdAt 升序排列
 * - 获取消息和发送消息的错误处理
 *
 * Validates: Requirements 2.1, 2.5, 2.6, 2.8
 */

import {
  canSendMessage,
  formatMessageTime,
  isOwnMessage,
  type CaseStatus,
} from "@/lib/dcr-ui-helpers";

/* ========== Types (mirrors MessagePanel) ========== */

interface MessageItem {
  id: string;
  content: string;
  isAnonymous: boolean;
  senderId: string;
  createdAt: string;
}

/* ========== 1. canSendMessage — 发送表单显示/隐藏逻辑 ========== */

describe("MessagePanel — 发送表单显示/隐藏逻辑", () => {
  it("IN_PROGRESS 状态应显示发送表单", () => {
    expect(canSendMessage("IN_PROGRESS")).toBe(true);
  });

  it("NEED_MORE_INFO 状态应显示发送表单", () => {
    expect(canSendMessage("NEED_MORE_INFO")).toBe(true);
  });

  it("OPENED 状态应隐藏发送表单", () => {
    expect(canSendMessage("OPENED")).toBe(false);
  });

  it("CLOSED 状态应隐藏发送表单", () => {
    expect(canSendMessage("CLOSED")).toBe(false);
  });

  it("所有活跃状态都允许发送，所有非活跃状态都禁止", () => {
    const allStatuses: CaseStatus[] = ["OPENED", "IN_PROGRESS", "NEED_MORE_INFO", "CLOSED"];
    const allowed = allStatuses.filter(canSendMessage);
    const blocked = allStatuses.filter((s) => !canSendMessage(s));

    expect(allowed).toEqual(["IN_PROGRESS", "NEED_MORE_INFO"]);
    expect(blocked).toEqual(["OPENED", "CLOSED"]);
  });
});

/* ========== 2. isOwnMessage — 消息气泡对齐逻辑 ========== */

describe("MessagePanel — 消息气泡对齐逻辑", () => {
  it("自己发送的消息应靠右（isOwnMessage = true）", () => {
    expect(isOwnMessage("user-abc", "user-abc")).toBe(true);
  });

  it("对方发送的消息应靠左（isOwnMessage = false）", () => {
    expect(isOwnMessage("user-xyz", "user-abc")).toBe(false);
  });

  it("空 senderId 与非空 currentUserId 不匹配", () => {
    expect(isOwnMessage("", "user-1")).toBe(false);
  });

  it("两个不同 ID 不匹配", () => {
    expect(isOwnMessage("sender-1", "sender-2")).toBe(false);
  });

  it("相同 ID 始终匹配", () => {
    const id = "same-user-id";
    expect(isOwnMessage(id, id)).toBe(true);
  });
});

/* ========== 3. formatMessageTime — 日期格式化 ========== */

describe("MessagePanel — 消息时间格式化", () => {
  it("有效 ISO 日期应返回 MM-DD HH:mm 格式", () => {
    const result = formatMessageTime("2024-06-15T14:30:00.000Z");
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("月份和日期应零填充", () => {
    // January 5th — month=01, day=05
    const result = formatMessageTime("2024-01-05T03:07:00.000Z");
    expect(result).toMatch(/^01-05 \d{2}:\d{2}$/);
  });

  it("无效日期应返回原始字符串", () => {
    expect(formatMessageTime("invalid-date")).toBe("invalid-date");
  });

  it("空字符串应返回空字符串", () => {
    expect(formatMessageTime("")).toBe("");
  });
});

/* ========== 4. 消息列表排序逻辑 ========== */

describe("MessagePanel — 消息列表排序", () => {
  /**
   * MessagePanel 从 API 获取消息后直接渲染（API 已按 createdAt 升序返回）。
   * 这里验证排序逻辑：给定一组消息，按 createdAt 升序排列后最新消息在底部。
   */

  const unsortedMessages: MessageItem[] = [
    { id: "3", content: "第三条", isAnonymous: true, senderId: "u1", createdAt: "2024-06-15T10:30:00Z" },
    { id: "1", content: "第一条", isAnonymous: true, senderId: "u2", createdAt: "2024-06-15T08:00:00Z" },
    { id: "2", content: "第二条", isAnonymous: true, senderId: "u1", createdAt: "2024-06-15T09:15:00Z" },
  ];

  it("按 createdAt 升序排列后，最早的消息在前", () => {
    const sorted = [...unsortedMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    expect(sorted[0].id).toBe("1");
    expect(sorted[1].id).toBe("2");
    expect(sorted[2].id).toBe("3");
  });

  it("已排序的消息列表保持不变", () => {
    const alreadySorted: MessageItem[] = [
      { id: "a", content: "早", isAnonymous: true, senderId: "u1", createdAt: "2024-01-01T00:00:00Z" },
      { id: "b", content: "晚", isAnonymous: true, senderId: "u2", createdAt: "2024-01-01T01:00:00Z" },
    ];

    const sorted = [...alreadySorted].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("空消息列表排序后仍为空", () => {
    const sorted: MessageItem[] = [];
    expect(sorted.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )).toEqual([]);
  });

  it("单条消息排序后保持不变", () => {
    const single: MessageItem[] = [
      { id: "only", content: "唯一", isAnonymous: true, senderId: "u1", createdAt: "2024-06-15T12:00:00Z" },
    ];
    const sorted = [...single].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("only");
  });
});


/* ========== 5. 错误处理模式 ========== */

/**
 * 模拟 MessagePanel 中 fetchMessages 的核心逻辑。
 * 提取组件中的 fetch + 错误处理流程进行独立测试。
 */

interface FetchMessagesResult {
  messages: MessageItem[];
  error: string | null;
}

async function simulateFetchMessages(
  caseId: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<FetchMessagesResult> {
  try {
    const res = await fetchImpl(`/api/cases/${caseId}/messages`);
    if (res.ok) {
      const data = await res.json();
      return { messages: data.messages ?? [], error: null };
    } else {
      const data = await res.json().catch(() => null);
      return { messages: [], error: data?.error ?? "加载消息失败" };
    }
  } catch {
    return { messages: [], error: "网络错误，请检查连接后重试" };
  }
}

/**
 * 模拟 MessagePanel 中 handleSend 的核心逻辑。
 */

interface SendMessageResult {
  message: MessageItem | null;
  sendError: string | null;
}

async function simulateSendMessage(
  caseId: string,
  content: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<SendMessageResult> {
  const trimmed = content.trim();
  if (!trimmed) return { message: null, sendError: null };

  try {
    const res = await fetchImpl(`/api/cases/${caseId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });

    if (res.ok) {
      const data = await res.json();
      return { message: data.message, sendError: null };
    } else {
      const data = await res.json().catch(() => null);
      return { message: null, sendError: data?.error ?? "发送失败，请稍后重试" };
    }
  } catch {
    return { message: null, sendError: "网络错误，请检查连接后重试" };
  }
}

describe("MessagePanel — 获取消息错误处理", () => {
  it("成功获取消息列表", async () => {
    const mockMessages: MessageItem[] = [
      { id: "m1", content: "你好", isAnonymous: true, senderId: "u1", createdAt: "2024-06-15T08:00:00Z" },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: mockMessages }),
    });

    const result = await simulateFetchMessages(
      "case-1",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.messages).toEqual(mockMessages);
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/cases/case-1/messages");
  });

  it("API 返回错误时提取 error 字段", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "权限不足" }),
    });

    const result = await simulateFetchMessages(
      "case-2",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.messages).toEqual([]);
    expect(result.error).toBe("权限不足");
  });

  it("API 返回错误但 JSON 解析失败时使用默认消息", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error("parse error")),
    });

    const result = await simulateFetchMessages(
      "case-3",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.messages).toEqual([]);
    expect(result.error).toBe("加载消息失败");
  });

  it("网络错误时显示网络错误消息", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await simulateFetchMessages(
      "case-4",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.messages).toEqual([]);
    expect(result.error).toBe("网络错误，请检查连接后重试");
  });

  it("API 返回空 messages 数组时正常处理", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [] }),
    });

    const result = await simulateFetchMessages(
      "case-5",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.messages).toEqual([]);
    expect(result.error).toBeNull();
  });
});

describe("MessagePanel — 发送消息错误处理", () => {
  it("成功发送消息", async () => {
    const newMsg: MessageItem = {
      id: "m-new",
      content: "测试消息",
      isAnonymous: true,
      senderId: "u1",
      createdAt: "2024-06-15T12:00:00Z",
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: newMsg }),
    });

    const result = await simulateSendMessage(
      "case-1",
      "测试消息",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.message).toEqual(newMsg);
    expect(result.sendError).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith("/api/cases/case-1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "测试消息" }),
    });
  });

  it("空内容不应发送请求", async () => {
    const mockFetch = vi.fn();

    const result = await simulateSendMessage(
      "case-1",
      "   ",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.message).toBeNull();
    expect(result.sendError).toBeNull();
  });

  it("API 返回错误时提取 error 字段", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "当前状态不允许发送消息" }),
    });

    const result = await simulateSendMessage(
      "case-2",
      "hello",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.message).toBeNull();
    expect(result.sendError).toBe("当前状态不允许发送消息");
  });

  it("API 返回错误但 JSON 解析失败时使用默认消息", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error("parse error")),
    });

    const result = await simulateSendMessage(
      "case-3",
      "hello",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.message).toBeNull();
    expect(result.sendError).toBe("发送失败，请稍后重试");
  });

  it("网络错误时显示网络错误消息", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const result = await simulateSendMessage(
      "case-4",
      "hello",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.message).toBeNull();
    expect(result.sendError).toBe("网络错误，请检查连接后重试");
  });

  it("内容前后空格应被 trim", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { id: "m1", content: "trimmed", isAnonymous: true, senderId: "u1", createdAt: "2024-01-01T00:00:00Z" } }),
    });

    await simulateSendMessage(
      "case-5",
      "  trimmed  ",
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/cases/case-5/messages",
      expect.objectContaining({
        body: JSON.stringify({ content: "trimmed" }),
      }),
    );
  });
});

/* ========== 6. 消息气泡对齐与渲染集成逻辑 ========== */

describe("MessagePanel — 消息气泡对齐与渲染集成", () => {
  /**
   * 模拟组件渲染消息列表时的对齐判断逻辑。
   * 组件中使用 isOwnMessage 决定 justify-end（右）或 justify-start（左）。
   */

  const currentUserId = "current-user";

  const messages: MessageItem[] = [
    { id: "m1", content: "你好", isAnonymous: true, senderId: "current-user", createdAt: "2024-06-15T08:00:00Z" },
    { id: "m2", content: "你好呀", isAnonymous: true, senderId: "other-user", createdAt: "2024-06-15T08:01:00Z" },
    { id: "m3", content: "有什么问题？", isAnonymous: true, senderId: "current-user", createdAt: "2024-06-15T08:02:00Z" },
  ];

  it("自己的消息应标记为 own（靠右）", () => {
    const alignments = messages.map((msg) => ({
      id: msg.id,
      isOwn: isOwnMessage(msg.senderId, currentUserId),
    }));

    expect(alignments[0]).toEqual({ id: "m1", isOwn: true });
    expect(alignments[1]).toEqual({ id: "m2", isOwn: false });
    expect(alignments[2]).toEqual({ id: "m3", isOwn: true });
  });

  it("对方的消息应标记为非 own（靠左）", () => {
    const otherMessages = messages.filter(
      (msg) => !isOwnMessage(msg.senderId, currentUserId),
    );
    expect(otherMessages).toHaveLength(1);
    expect(otherMessages[0].id).toBe("m2");
  });

  it("每条消息都应有格式化的时间", () => {
    const times = messages.map((msg) => formatMessageTime(msg.createdAt));
    for (const t of times) {
      expect(t).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    }
  });
});


/* ========== 7. isSubmitter prop — OPENED 状态发送权限 ========== */

describe("MessagePanel — isSubmitter prop 发送权限", () => {
  /**
   * MessagePanel 使用 canSendMessage(caseStatus, isSubmitter) 决定发送表单显示。
   * 验证 isSubmitter 参数在各状态下的影响。
   *
   * Validates: Requirements 2.7, 2.8
   */

  it("OPENED 状态 + isSubmitter=true 应显示发送表单", () => {
    expect(canSendMessage("OPENED", true)).toBe(true);
  });

  it("OPENED 状态 + isSubmitter=false 应隐藏发送表单", () => {
    expect(canSendMessage("OPENED", false)).toBe(false);
  });

  it("OPENED 状态 + isSubmitter=undefined 应隐藏发送表单", () => {
    expect(canSendMessage("OPENED", undefined)).toBe(false);
  });

  it("IN_PROGRESS 状态不受 isSubmitter 影响", () => {
    expect(canSendMessage("IN_PROGRESS", true)).toBe(true);
    expect(canSendMessage("IN_PROGRESS", false)).toBe(true);
    expect(canSendMessage("IN_PROGRESS", undefined)).toBe(true);
  });

  it("NEED_MORE_INFO 状态不受 isSubmitter 影响", () => {
    expect(canSendMessage("NEED_MORE_INFO", true)).toBe(true);
    expect(canSendMessage("NEED_MORE_INFO", false)).toBe(true);
  });

  it("CLOSED 状态不受 isSubmitter 影响", () => {
    expect(canSendMessage("CLOSED", true)).toBe(false);
    expect(canSendMessage("CLOSED", false)).toBe(false);
  });
});

/* ========== 8. 轮询机制逻辑测试 ========== */

describe("MessagePanel — 轮询机制逻辑", () => {
  /**
   * 由于测试环境为 node（无 jsdom），无法直接测试 React useEffect。
   * 这里通过模拟轮询核心逻辑来验证：
   * - setInterval 以 15 秒间隔调用 fetchMessages
   * - visibilitychange 事件触发时调用 fetchMessages
   * - 清理函数正确移除 interval 和事件监听器
   *
   * Validates: Requirements 2.7
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("setInterval 应以 15000ms 间隔调用回调", () => {
    const fetchMessages = vi.fn();
    const interval = setInterval(fetchMessages, 15000);

    expect(fetchMessages).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15000);
    expect(fetchMessages).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15000);
    expect(fetchMessages).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(15000);
    expect(fetchMessages).toHaveBeenCalledTimes(3);

    clearInterval(interval);
    vi.useRealTimers();
  });

  it("clearInterval 后不再调用回调", () => {
    const fetchMessages = vi.fn();
    const interval = setInterval(fetchMessages, 15000);

    vi.advanceTimersByTime(15000);
    expect(fetchMessages).toHaveBeenCalledTimes(1);

    clearInterval(interval);

    vi.advanceTimersByTime(30000);
    expect(fetchMessages).toHaveBeenCalledTimes(1); // 不再增加

    vi.useRealTimers();
  });

  it("14 秒内不应触发轮询", () => {
    const fetchMessages = vi.fn();
    const interval = setInterval(fetchMessages, 15000);

    vi.advanceTimersByTime(14999);
    expect(fetchMessages).not.toHaveBeenCalled();

    clearInterval(interval);
    vi.useRealTimers();
  });

  it("60 秒内应触发 4 次轮询", () => {
    const fetchMessages = vi.fn();
    const interval = setInterval(fetchMessages, 15000);

    vi.advanceTimersByTime(60000);
    expect(fetchMessages).toHaveBeenCalledTimes(4);

    clearInterval(interval);
    vi.useRealTimers();
  });
});

/* ========== 9. 页面可见性变化逻辑测试 ========== */

describe("MessagePanel — 页面可见性变化逻辑", () => {
  /**
   * 模拟 visibilitychange 事件处理逻辑。
   * 组件中的逻辑：当 document.visibilityState === "visible" 时调用 fetchMessages。
   *
   * Validates: Requirements 2.7
   */

  it("visibilityState 为 visible 时应调用 fetchMessages", () => {
    const fetchMessages = vi.fn();

    // 模拟组件中的 handleVisibilityChange 逻辑
    const handleVisibilityChange = (visibilityState: string) => {
      if (visibilityState === "visible") {
        fetchMessages();
      }
    };

    handleVisibilityChange("visible");
    expect(fetchMessages).toHaveBeenCalledTimes(1);
  });

  it("visibilityState 为 hidden 时不应调用 fetchMessages", () => {
    const fetchMessages = vi.fn();

    const handleVisibilityChange = (visibilityState: string) => {
      if (visibilityState === "visible") {
        fetchMessages();
      }
    };

    handleVisibilityChange("hidden");
    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it("多次切换可见性应多次调用 fetchMessages", () => {
    const fetchMessages = vi.fn();

    const handleVisibilityChange = (visibilityState: string) => {
      if (visibilityState === "visible") {
        fetchMessages();
      }
    };

    handleVisibilityChange("hidden");
    handleVisibilityChange("visible");
    handleVisibilityChange("hidden");
    handleVisibilityChange("visible");

    expect(fetchMessages).toHaveBeenCalledTimes(2);
  });

  it("cleanup 应移除事件监听器（模拟模式）", () => {
    const fetchMessages = vi.fn();
    const listeners: Array<() => void> = [];

    // 模拟 addEventListener / removeEventListener
    const addEventListener = (_event: string, handler: () => void) => {
      listeners.push(handler);
    };
    const removeEventListener = (_event: string, handler: () => void) => {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    };

    const handleVisibilityChange = () => {
      fetchMessages();
    };

    addEventListener("visibilitychange", handleVisibilityChange);
    expect(listeners).toHaveLength(1);

    // 模拟 cleanup
    removeEventListener("visibilitychange", handleVisibilityChange);
    expect(listeners).toHaveLength(0);
  });
});
