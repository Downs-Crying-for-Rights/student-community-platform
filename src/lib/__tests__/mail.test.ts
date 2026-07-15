import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: mocks.findUnique },
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

import { sendUserMail } from "../mail";

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
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
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.findUnique.mockResolvedValue({ email: "student@example.com" });
    mocks.sendMail.mockResolvedValue({ messageId: "mail-1" });
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
      expect.objectContaining({ port: 465, secure: true }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "student@example.com",
      from: "mailer@example.com",
      subject: "审核已通过",
      text: "您的申请已通过审核。",
    });
  });

  it("skips delivery when the user has no registered email", async () => {
    mocks.findUnique.mockResolvedValue({ email: null });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      sendUserMail({ userId: "user-2", subject: "审核结果", text: "结果" }),
    ).resolves.toEqual({ sent: false, reason: "user_has_no_email" });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
