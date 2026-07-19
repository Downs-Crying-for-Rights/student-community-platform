import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inboxFindUnique: vi.fn(),
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
  default: { qQBotEventInbox: { findUnique: mocks.inboxFindUnique } },
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
      data: expect.objectContaining({ response: result, processedAt: expect.any(Date) }),
    });
  });

  it("persists the complete final answer, seven-day draft, submit grant, and saved link response", async () => {
    const payload = {
      contentType: "TUTORING",
      schoolName: "测试高级中学",
      schoolCategory: "公立学历制学校",
      schoolType: "高级中学",
      schoolAddress: "测试路 1 号",
      reportChannels: "12345",
      description: "学校从本学期开始要求全年级每周六到校上课，涉及多个班级。",
      feeStatus: "none",
      feeDetails: null,
      demands: ["停止补课"],
      otherDemand: null,
      grade: "高二",
      timeRange: "2026 年 7 月至今",
      province: "广东省",
      city: "广州市",
      expectedHelperProvince: null,
    };
    mocks.tx.qQIdentity.findUnique.mockResolvedValue({ user: { id: "user-1", isBanned: false } });
    mocks.tx.qQConversation.findUnique.mockResolvedValue({
      ownerId: "user-1",
      state: "DELEGATION_FORM",
      step: 16,
      revision: 17,
      payload,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.tx.qQConversation.update.mockResolvedValue({ revision: 18 });
    const finalMessage: QQBotMessage = {
      ...bindingMessage,
      eventId: "1000000000:124",
      input: { type: "text", text: "1" },
    };

    const result = await processQQBotMessage(finalMessage);

    const draftData = mocks.tx.qQDelegationDraft.create.mock.calls[0][0].data;
    expect(draftData).toMatchObject({
      ownerId: "user-1",
      schemaVersion: 1,
      payload: expect.objectContaining({
        grade: "高二",
        timeRange: "2026 年 7 月至今",
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
      conversation: { state: "draft", revision: "18", prompt: null },
    });
  });
});
