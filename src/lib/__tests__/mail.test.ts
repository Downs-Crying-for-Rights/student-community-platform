import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mocks.findUnique, findMany: mocks.findMany },
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo, warn: mocks.logWarn, error: mocks.logError },
}));

import { sendAdminActionMail, sendUserMail } from "../mail";

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_TLS_SERVERNAME",
] as const;

describe("sendUserMail", () => {
  const originalEnv: Partial<Record<(typeof SMTP_KEYS)[number], string>> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of SMTP_KEYS) originalEnv[key] = process.env[key];
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASSWORD = "secret";
    process.env.SMTP_FROM = "mailer@example.com";
    process.env.SMTP_TLS_SERVERNAME = "mail.example.com";
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.findUnique.mockResolvedValue({ email: "student@example.com" });
    mocks.findMany.mockResolvedValue([
      { email: "moderator@example.com" },
      { email: "admin@example.com" },
      { email: "admin@example.com" },
    ]);
    mocks.sendMail.mockResolvedValue({
      messageId: "mail-1",
      accepted: ["student@example.com"],
      rejected: [],
      response: "250 2.0.0 queued",
    });
    mocks.logInfo.mockResolvedValue(undefined);
    mocks.logWarn.mockResolvedValue(undefined);
    mocks.logError.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const key of SMTP_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends the review email to the user's registered address", async () => {
    const result = await sendUserMail({
      userId: "user-1",
      subject: "审核已通过",
      text: "您的申请已通过审核。",
    });

    expect(result).toEqual({ sent: true });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
        tls: { servername: "mail.example.com" },
      }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "student@example.com",
      from: "mailer@example.com",
      subject: "审核已通过",
      text: "您的申请已通过审核。",
    });
    expect(mocks.logInfo).toHaveBeenCalledWith(
      "邮件投递成功：审核已通过",
      expect.objectContaining({
        source: "mail",
        userId: "user-1",
        detail: expect.objectContaining({ status: "SENT", recipients: ["student@example.com"] }),
      }),
    );
  });

  it("skips delivery when the user has no registered email", async () => {
    mocks.findUnique.mockResolvedValue({ email: null });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      sendUserMail({ userId: "user-2", subject: "审核结果", text: "结果" }),
    ).resolves.toEqual({ sent: false, reason: "user_has_no_email" });
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "邮件已跳过：审核结果",
      expect.objectContaining({ detail: expect.objectContaining({ reason: "user_has_no_email" }) }),
    );
  });

  it("sends one BCC email to eligible administrators with deduplicated addresses", async () => {
    const result = await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新举报待处理",
      text: "收到一条新举报。",
      actionUrl: "/admin/reports",
    });

    expect(result).toEqual({ sent: true, recipientCount: 2 });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] },
        isBanned: false,
        email: { not: null },
      },
      select: { email: true },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "mailer@example.com",
      bcc: ["moderator@example.com", "admin@example.com"],
      subject: "[管理员待办] 新举报待处理",
      text: expect.stringContaining("https://forum.dcr2026.com/admin/reports"),
    }));
  });

  it("limits administrator-only actions to ADMIN and SUPER_ADMIN", async () => {
    await sendAdminActionMail({
      minimumRole: "ADMIN",
      subject: "DCR 申请待审核",
      text: "收到申请。",
      actionUrl: "/admin/applications",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ["ADMIN", "SUPER_ADMIN"] } }),
    }));
  });

  it("records partial administrator delivery with rejected recipients", async () => {
    mocks.sendMail.mockResolvedValue({
      messageId: "mail-partial",
      accepted: ["mailer@example.com", "moderator@example.com"],
      rejected: ["admin@example.com"],
      response: "250 queued with one rejected recipient",
    });

    await sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "新举报待处理",
      text: "收到一条新举报。",
      actionUrl: "/admin/reports",
    });

    expect(mocks.logWarn).toHaveBeenCalledWith(
      "管理员待办邮件部分投递：新举报待处理",
      expect.objectContaining({
        source: "mail",
        detail: expect.objectContaining({ status: "PARTIAL", rejected: ["admin@example.com"] }),
      }),
    );
  });

  it("isolates SMTP failures from the business operation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendMail.mockRejectedValue(new Error("SMTP unavailable"));

    await expect(sendAdminActionMail({
      minimumRole: "MODERATOR",
      subject: "待处理事项",
      text: "内容",
      actionUrl: "/admin/moderation",
    })).resolves.toEqual({ sent: false, recipientCount: 0, reason: "send_failed" });
    expect(mocks.logError).toHaveBeenCalledWith(
      "管理员待办邮件投递失败：待处理事项",
      expect.objectContaining({ detail: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
