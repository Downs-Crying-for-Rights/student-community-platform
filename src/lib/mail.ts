import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";

interface UserMailOptions {
  userId: string;
  subject: string;
  text: string;
}

export interface UserMailResult {
  sent: boolean;
  reason?: "smtp_not_configured" | "user_has_no_email" | "send_failed";
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
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT) || 587;

  if (!host || !user || !password || !from) {
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

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    await transport.sendMail({
      to: recipient.email,
      from,
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
