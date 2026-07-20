import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inboxFindUnique: vi.fn(),
  identityFindUnique: vi.fn(),
  conversationFindUnique: vi.fn(),
  transaction: vi.fn(),
  tx: {
    qQBotEventInbox: { create: vi.fn(), update: vi.fn() },
    qQIdentity: { findUnique: vi.fn() },
    qQGrant: { create: vi.fn() },
    qQConversation: { findUnique: vi.fn(), update: vi.fn() },
    qQDelegationDraft: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    qQBotEventInbox: { findUnique: mocks.inboxFindUnique },
    qQIdentity: { findUnique: mocks.identityFindUnique },
    qQConversation: { findUnique: mocks.conversationFindUnique },
  },
}));
vi.mock("@/lib/serializable-transaction", () => ({
  runSerializableTransaction: mocks.transaction,
}));
vi.mock("@/lib/qq-config", () => ({
  getQQConfig: () => ({
    identityEncryptionKey: Buffer.alloc(32, 1),
    identityHmacKey: Buffer.alloc(32, 2),
    grantHmacKey: Buffer.alloc(32, 3),
    keyVersion: 4,
    grantTtlSeconds: 900,
  }),
}));
vi.mock("@/lib/sensitive-engine", () => ({ scanContent: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/qq-draft-ai-review", () => ({ reviewQQDraftWithAi: vi.fn().mockResolvedValue([]) }));

import { processQQBotMessage } from "./qq-bot-service";
import type { QQBotMessage, QQBotResponse } from "./qq-bot-contract";

const bindingMessage: QQBotMessage = {
  version: 1,
  eventId: "1000000000:123",
  platform: "onebot11",
  selfId: "1000000000",
  userId: "2000000000",
  occurredAt: "2026-07-19T10:00:00.000Z",
  input: { type: "command", command: "绑定" },
};

describe("QQ bot transactional service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inboxFindUnique.mockResolvedValue(null);
    mocks.identityFindUnique.mockResolvedValue(null);
    mocks.conversationFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((operation: (tx: typeof mocks.tx) => unknown) => operation(mocks.tx));
    mocks.tx.qQIdentity.findUnique.mockResolvedValue(null);
    mocks.tx.qQBotEventInbox.create.mockResolvedValue({});
    mocks.tx.qQBotEventInbox.update.mockResolvedValue({});
    mocks.tx.qQGrant.create.mockResolvedValue({});
    mocks.tx.qQDelegationDraft.create.mockResolvedValue({ id: "draft-1" });
  });

  it("returns the exact saved response as a duplicate without applying the event", async () => {
    const saved: QQBotResponse = {
      duplicate: false,
      replies: ["original"],
      conversation: { state: "delegation_form", revision: "7", prompt: "city" },
    };
    mocks.inboxFindUnique.mockResolvedValue({ response: saved });

    await expect(processQQBotMessage(bindingMessage)).resolves.toEqual({ ...saved, duplicate: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("atomically claims an unbound event, creates an encrypted pending binding grant, and saves its response", async () => {
    const result = await processQQBotMessage(bindingMessage);

    expect(mocks.tx.qQBotEventInbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: bindingMessage.eventId, selfId: bindingMessage.selfId }),
    });
    const grant = mocks.tx.qQGrant.create.mock.calls[0][0].data;
    expect(grant).toMatchObject({
      purpose: "IDENTITY_BIND",
      identityKeyVersion: 4,
    });
    expect(grant.userId).toBeUndefined();
    expect(grant.identityCiphertext).not.toContain(bindingMessage.userId);
    expect(grant.identityLookupHash).not.toBe(bindingMessage.userId);
    expect(result).toMatchObject({
      duplicate: false,
      replies: [expect.stringMatching(/^请在浏览器中完成账号绑定：https:\/\/forum\.dcr2026\.com\/qq\/bind\?token=qqg_/)],
      conversation: { state: "binding", revision: "1", prompt: null },
    });
    expect(mocks.tx.qQBotEventInbox.update).toHaveBeenCalledWith({
      where: { eventId: bindingMessage.eventId },
      data: expect.objectContaining({
        response: { ...result, replies: [] },
        replyCiphertext: expect.any(String),
        replyIv: expect.any(String),
        replyAuthTag: expect.any(String),
        processedAt: expect.any(Date),
      }),
    });
  });

  it("persists the complete final answer, seven-day draft, submit grant, and saved link response", async () => {
    mocks.tx.qQIdentity.findUnique.mockResolvedValue({ user: { id: "user-1", isBanned: false } });
    mocks.identityFindUnique.mockResolvedValue({ userId: "user-1" });
    mocks.conversationFindUnique.mockResolvedValue({
      state: "DELEGATION_FORM",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.tx.qQConversation.findUnique.mockResolvedValue({
      ownerId: "user-1",
      state: "DELEGATION_FORM",
      step: 0,
      revision: 1,
      payload: {},
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.tx.qQConversation.update.mockResolvedValue({ revision: 2 });
    const finalMessage: QQBotMessage = {
      ...bindingMessage,
      eventId: "1000000000:124",
      input: { type: "text", text: `内容类型：学校补课
学校全称：测试高级中学
学校性质：公立学历制学校
学校类型：高级中学
详细地址：广东省广州市测试路 1 号
举报途径：020-12345 热线
行为描述：学校安排高二年级学生每周六上午八点至十二点到校统一补课。
收费情况：无
收费详情：无
诉求：停止补课
其他诉求：无
涉及年级：高二
时间范围：2026 年 7 月至今，每周六 8:00-12:00
所在省份：广东省
所在城市：广州市
期望互助人省份：无
风险偏好：仅站内沟通` },
    };

    const result = await processQQBotMessage(finalMessage);

    const draftData = mocks.tx.qQDelegationDraft.create.mock.calls[0][0].data;
    expect(draftData).toMatchObject({
      ownerId: "user-1",
      schemaVersion: 2,
      payload: expect.objectContaining({
        grade: "高二",
        timeRange: "2026 年 7 月至今，每周六 8:00-12:00",
        province: "广东省",
        city: "广州市",
        expectedHelperProvince: null,
        riskPreference: "仅站内沟通",
      }),
      payloadHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: expect.any(Date),
    });
    expect(draftData.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 24 * 60 * 60 * 1_000);
    expect(mocks.tx.qQGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: "DELEGATION_SUBMIT", userId: "user-1", draftId: "draft-1" }),
    });
    expect(result).toMatchObject({
      duplicate: false,
      replies: [expect.stringMatching(/^委托草稿已保存 7 天。.*https:\/\/forum\.dcr2026\.com\/qq\/draft\?token=qqg_/)],
      conversation: { state: "draft", revision: "2", prompt: null },
    });
  });

  it("returns only a supplement list and no assessment link when required details are missing", async () => {
    mocks.tx.qQIdentity.findUnique.mockResolvedValue({ user: { id: "user-1", isBanned: false } });
    mocks.identityFindUnique.mockResolvedValue({ userId: "user-1" });
    mocks.conversationFindUnique.mockResolvedValue({ state: "DELEGATION_FORM", expiresAt: new Date(Date.now() + 60_000) });
    mocks.tx.qQConversation.findUnique.mockResolvedValue({
      state: "DELEGATION_FORM", step: 0, revision: 1, payload: {}, expiresAt: new Date(Date.now() + 60_000),
    });
    const message: QQBotMessage = {
      ...bindingMessage,
      eventId: "1000000000:125",
      input: { type: "text", text: "内容类型：学校补课" },
    };

    const result = await processQQBotMessage(message);

    expect(result.replies.join("\n")).toContain("请补全以下字段");
    expect(result.replies.join("\n")).toContain("AI 辅助生成");
    expect(result.replies.join("\n")).not.toMatch(/AZEOi5|考核链接|\/qq\/draft\?token=/);
    expect(mocks.tx.qQDelegationDraft.create).not.toHaveBeenCalled();
    expect(mocks.tx.qQGrant.create).not.toHaveBeenCalled();
  });
});
