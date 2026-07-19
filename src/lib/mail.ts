import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface UserMailOptions {
  userId: string;
  subject: string;
  text: string;
}

interface AdminActionMailOptions {
  minimumRole: "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
  subject: string;
  text: string;
  actionUrl: string;
}

export interface UserMailResult {
  sent: boolean;
  reason?: "smtp_not_configured" | "user_has_no_email" | "send_failed";
}

export interface AdminActionMailResult {
  sent: boolean;
  recipientCount: number;
  reason?: "smtp_not_configured" | "no_recipients" | "send_failed";
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT) || 587;
  if (!host || !user || !password || !from) return null;
  return { host, user, password, from, port };
}

function createMailTransport(config: NonNullable<ReturnType<typeof getSmtpConfig>>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : String(item));
}

function smtpResultDetail(info: unknown) {
  if (!info || typeof info !== "object") {
    return { messageId: null, accepted: [] as string[], rejected: [] as string[], response: null };
  }
  const result = info as Record<string, unknown>;
  return {
    messageId: typeof result.messageId === "string" ? result.messageId : null,
    accepted: stringList(result.accepted),
    rejected: stringList(result.rejected),
    response: typeof result.response === "string" ? result.response.slice(0, 1000) : null,
  };
}

function smtpErrorDetail(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error).slice(0, 1000) };
  const smtpError = error as Error & { code?: unknown; command?: unknown; response?: unknown; responseCode?: unknown };
  return {
    name: error.name,
    message: error.message.slice(0, 1000),
    code: typeof smtpError.code === "string" ? smtpError.code : null,
    command: typeof smtpError.command === "string" ? smtpError.command : null,
    response: typeof smtpError.response === "string" ? smtpError.response.slice(0, 1000) : null,
    responseCode: typeof smtpError.responseCode === "number" ? smtpError.responseCode : null,
  };
}

/**
 * Send a transactional email without allowing a temporary SMTP failure to
 * roll back the business operation that already completed.
 */
export async function sendUserMail({
  userId,
  subject,
  text,
}: UserMailOptions): Promise<UserMailResult> {
  const config = getSmtpConfig();

  if (!config) {
    await logger.warn(`邮件已跳过：${subject}`, {
      source: "mail",
      userId,
      detail: { kind: "USER", status: "SKIPPED", reason: "smtp_not_configured", subject, recipients: [] },
    });
    return { sent: false, reason: "smtp_not_configured" };
  }

  let recipientEmail: string | null = null;
  try {
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    recipientEmail = recipient?.email ?? null;

    if (!recipientEmail) {
      await logger.warn(`邮件已跳过：${subject}`, {
        source: "mail",
        userId,
        detail: { kind: "USER", status: "SKIPPED", reason: "user_has_no_email", subject, recipients: [] },
      });
      return { sent: false, reason: "user_has_no_email" };
    }

    const transport = createMailTransport(config);

    const info = await transport.sendMail({
      to: recipientEmail,
      from: config.from,
      subject,
      text,
    });
    const smtp = smtpResultDetail(info);
    const detail = {
      kind: "USER",
      status: smtp.rejected.length > 0 ? "PARTIAL" : "SENT",
      subject,
      recipients: [recipientEmail],
      from: config.from,
      smtpHost: config.host,
      smtpPort: config.port,
      ...smtp,
    };
    if (smtp.rejected.length > 0) {
      await logger.warn(`邮件部分投递：${subject}`, { source: "mail", userId, detail });
    } else {
      await logger.info(`邮件投递成功：${subject}`, { source: "mail", userId, detail });
    }
    return { sent: true };
  } catch (error) {
    await logger.error(`邮件投递失败：${subject}`, {
      source: "mail",
      userId,
      detail: {
        kind: "USER",
        status: "FAILED",
        subject,
        recipients: recipientEmail ? [recipientEmail] : [],
        from: config.from,
        smtpHost: config.host,
        smtpPort: config.port,
        error: smtpErrorDetail(error),
      },
    });
    return { sent: false, reason: "send_failed" };
  }
}

/** Notify every eligible administrator without exposing recipient addresses. */
export async function sendAdminActionMail({
  minimumRole,
  subject,
  text,
  actionUrl,
}: AdminActionMailOptions): Promise<AdminActionMailResult> {
  const config = getSmtpConfig();
  if (!config) {
    await logger.warn(`管理员待办邮件已跳过：${subject}`, {
      source: "mail",
      detail: { kind: "ADMIN_ACTION", status: "SKIPPED", reason: "smtp_not_configured", subject, minimumRole, recipients: [] },
    });
    return { sent: false, recipientCount: 0, reason: "smtp_not_configured" };
  }

  const roles = minimumRole === "SUPER_ADMIN"
    ? ["SUPER_ADMIN" as const]
    : minimumRole === "ADMIN"
      ? ["ADMIN" as const, "SUPER_ADMIN" as const]
      : ["MODERATOR" as const, "ADMIN" as const, "SUPER_ADMIN" as const];

  let recipients: string[] = [];
  try {
    const administrators = await prisma.user.findMany({
      where: { role: { in: roles }, isBanned: false, email: { not: null } },
      select: { email: true },
    });
    recipients = [...new Set(administrators.flatMap(({ email }) => email ? [email] : []))];
    if (recipients.length === 0) {
      await logger.warn(`管理员待办邮件已跳过：${subject}`, {
        source: "mail",
        detail: { kind: "ADMIN_ACTION", status: "SKIPPED", reason: "no_recipients", subject, minimumRole, recipients: [] },
      });
      return { sent: false, recipientCount: 0, reason: "no_recipients" };
    }

    const appUrl = (process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "");
    const url = actionUrl.startsWith("http") ? actionUrl : `${appUrl}${actionUrl.startsWith("/") ? "" : "/"}${actionUrl}`;
    const transport = createMailTransport(config);
    const info = await transport.sendMail({
      to: config.from,
      bcc: recipients,
      from: config.from,
      subject: `[管理员待办] ${subject}`,
      text: `${text}\n\n立即处理：${url}`,
    });
    const smtp = smtpResultDetail(info);
    const detail = {
      kind: "ADMIN_ACTION",
      status: smtp.rejected.length > 0 ? "PARTIAL" : "SENT",
      subject,
      minimumRole,
      recipients,
      from: config.from,
      smtpHost: config.host,
      smtpPort: config.port,
      ...smtp,
    };
    if (smtp.rejected.length > 0) {
      await logger.warn(`管理员待办邮件部分投递：${subject}`, { source: "mail", detail });
    } else {
      await logger.info(`管理员待办邮件投递成功：${subject}`, { source: "mail", detail });
    }
    return { sent: true, recipientCount: recipients.length };
  } catch (error) {
    await logger.error(`管理员待办邮件投递失败：${subject}`, {
      source: "mail",
      detail: {
        kind: "ADMIN_ACTION",
        status: "FAILED",
        subject,
        minimumRole,
        recipients,
        from: config.from,
        smtpHost: config.host,
        smtpPort: config.port,
        error: smtpErrorDetail(error),
      },
    });
    return { sent: false, recipientCount: 0, reason: "send_failed" };
  }
}
