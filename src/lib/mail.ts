import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";

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
    console.warn("Review email skipped: SMTP is not fully configured", { userId });
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!recipient?.email) {
      console.warn("Review email skipped: user has no email address", { userId });
      return { sent: false, reason: "user_has_no_email" };
    }

    const transport = createMailTransport(config);

    await transport.sendMail({
      to: recipient.email,
      from: config.from,
      subject,
      text,
    });
    return { sent: true };
  } catch (error) {
    console.error("Review email delivery failed", {
      userId,
      subject,
      error: error instanceof Error ? error.message : String(error),
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
    console.warn("Administrator action email skipped: SMTP is not fully configured", { subject });
    return { sent: false, recipientCount: 0, reason: "smtp_not_configured" };
  }

  const roles = minimumRole === "SUPER_ADMIN"
    ? ["SUPER_ADMIN" as const]
    : minimumRole === "ADMIN"
      ? ["ADMIN" as const, "SUPER_ADMIN" as const]
      : ["MODERATOR" as const, "ADMIN" as const, "SUPER_ADMIN" as const];

  try {
    const administrators = await prisma.user.findMany({
      where: { role: { in: roles }, isBanned: false, email: { not: null } },
      select: { email: true },
    });
    const recipients = [...new Set(administrators.flatMap(({ email }) => email ? [email] : []))];
    if (recipients.length === 0) {
      console.warn("Administrator action email skipped: no eligible recipients", { minimumRole, subject });
      return { sent: false, recipientCount: 0, reason: "no_recipients" };
    }

    const appUrl = (process.env.NEXTAUTH_URL || "https://forum.dcr2026.com").replace(/\/$/, "");
    const url = actionUrl.startsWith("http") ? actionUrl : `${appUrl}${actionUrl.startsWith("/") ? "" : "/"}${actionUrl}`;
    const transport = createMailTransport(config);
    await transport.sendMail({
      to: config.from,
      bcc: recipients,
      from: config.from,
      subject: `[管理员待办] ${subject}`,
      text: `${text}\n\n立即处理：${url}`,
    });
    return { sent: true, recipientCount: recipients.length };
  } catch (error) {
    console.error("Administrator action email delivery failed", {
      minimumRole,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, recipientCount: 0, reason: "send_failed" };
  }
}
