import { describe, expect, it, vi } from "vitest";
import { EventProcessor } from "./event-processor.js";
import type { InternalMessageResponse, MessageApi, OneBotAction } from "./types.js";

const response: InternalMessageResponse = {
  duplicate: false,
  replies: ["请填写标题"],
  conversation: { state: "delegation_form", revision: "2", prompt: "title" },
};

describe("EventProcessor", () => {
  it("does not forward group event details", async () => {
    const app: MessageApi = { processMessage: vi.fn() };
    const send = vi.fn();
    const processor = new EventProcessor(app, "42", new Set(["7"]), 65_536);
    const result = await processor.process(
      { post_type: "message", message_type: "group", group_id: 99, user_id: 7, raw_message: "private detail" },
      send,
    );
    expect(result).toBe("ignored");
    expect(app.processMessage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("routes a private command through the API and emits a OneBot action", async () => {
    const processMessage = vi.fn().mockResolvedValue(response);
    const app: MessageApi = { processMessage };
    const actions: OneBotAction[] = [];
    const processor = new EventProcessor(app, "42", new Set(["7"]), 65_536);
    const result = await processor.process(
      {
        time: 1_700_000_000,
        self_id: 42,
        post_type: "message",
        message_type: "private",
        message_id: 123,
        user_id: 7,
        message: "新建委托",
      },
      (action) => actions.push(action),
    );

    expect(result).toBe("processed");
    expect(processMessage).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "42:123", userId: "7", input: { type: "command", command: "新建委托" } }),
    );
    expect(actions).toEqual([{ action: "send_private_msg", params: { user_id: 7, message: "请填写标题" } }]);
  });

  it("returns a safe temporary failure without exposing API errors", async () => {
    const app: MessageApi = { processMessage: vi.fn().mockRejectedValue(new Error("token=secret")) };
    const actions: OneBotAction[] = [];
    const processor = new EventProcessor(app, "42", new Set(["7"]), 65_536);
    const result = await processor.process(
      { time: 1, self_id: 42, post_type: "message", message_type: "private", message_id: 1, user_id: 7, message: "状态" },
      (action) => actions.push(action),
    );
    expect(result).toBe("failed");
    expect(actions[0]?.params.message).toBe("服务暂时不可用，请稍后重试。");
  });

  it("does not send replies again for a duplicate event", async () => {
    const app: MessageApi = { processMessage: vi.fn().mockResolvedValue({ ...response, duplicate: true }) };
    const send = vi.fn();
    const processor = new EventProcessor(app, "42", new Set(["7"]), 65_536);
    const result = await processor.process(
      { time: 1, self_id: 42, post_type: "message", message_type: "private", message_id: 1, user_id: 7, message: "状态" },
      send,
    );
    expect(result).toBe("processed");
    expect(send).not.toHaveBeenCalled();
  });

  it("drops private messages from users outside the rollout allowlist", async () => {
    const app: MessageApi = { processMessage: vi.fn() };
    const send = vi.fn();
    const processor = new EventProcessor(app, "42", new Set(["100"]), 65_536);
    const result = await processor.process(
      { time: 1, self_id: 42, post_type: "message", message_type: "private", message_id: 1, user_id: 7, message: "状态" },
      send,
    );
    expect(result).toBe("ignored");
    expect(app.processMessage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
