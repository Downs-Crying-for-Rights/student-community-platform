import prisma from "./prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Create a notification record for a user.
 *
 * @param userId - Target user ID
 * @param type - Notification type (COMMENT, LIKE, REPORT_RESULT, CASE_UPDATE, DCR_ACCESS, PSYCH_MATCH, SYSTEM)
 * @param title - Notification title
 * @param content - Notification body text
 * @param link - Optional navigation link
 * @returns The created Notification record
 *
 * Validates: Requirements 20.1, 20.2, 20.3, 20.5
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  content: string,
  link?: string,
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      content,
      link: link ?? null,
    },
  });
}
