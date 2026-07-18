import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notification";

type NotificationContent = {
  title: string;
  content: string;
  link: string;
};

export async function notifyMutualAidUsersBestEffort(
  userIds: string[],
  notification: NotificationContent,
) {
  const recipients = [...new Set(userIds)];
  const results = await Promise.allSettled(recipients.map((userId) =>
    createNotification(userId, "SYSTEM", notification.title, notification.content, notification.link),
  ));

  if (results.some((result) => result.status === "rejected")) {
    console.error("Failed to create one or more mutual-aid notifications");
  }
}

export async function notifyMutualAidAdminsBestEffort(notification: NotificationContent) {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } },
      select: { id: true },
    });
    await notifyMutualAidUsersBestEffort(admins.map((admin) => admin.id), notification);
  } catch (error) {
    console.error("Failed to find mutual-aid notification administrators", error);
  }
}
