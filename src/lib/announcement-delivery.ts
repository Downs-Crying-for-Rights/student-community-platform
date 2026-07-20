import prisma from "@/lib/prisma";
import { SYSTEM_ANNOUNCEMENT_NAME, SYSTEM_ANNOUNCEMENT_USER_ID } from "@/lib/announcement";
import { getDMConsentDocument } from "@/lib/dm-consent";

const BATCH_SIZE = 100;

export async function queueAnnouncementDeliveries(announcementId: string) {
  const [consent, sender] = await Promise.all([
    getDMConsentDocument(),
    prisma.user.upsert({
      where: { id: SYSTEM_ANNOUNCEMENT_USER_ID },
      update: { nickname: SYSTEM_ANNOUNCEMENT_NAME, isBanned: true },
      create: {
        id: SYSTEM_ANNOUNCEMENT_USER_ID,
        nickname: SYSTEM_ANNOUNCEMENT_NAME,
        role: "USER",
        isBanned: true,
        onboardingDone: true,
        profileCompletionRequired: false,
      },
      select: { id: true },
    }),
  ]);

  let cursor: string | undefined;
  let queued = 0;
  do {
    const users = await prisma.user.findMany({
      where: {
        id: { not: sender.id },
        isBanned: false,
        dmConsentVersion: consent.revision,
        dmConsentAcceptedAt: { not: null },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (users.length === 0) break;
    const result = await prisma.announcementDelivery.createMany({
      data: users.map((user) => ({ announcementId, userId: user.id })),
      skipDuplicates: true,
    });
    queued += result.count;
    cursor = users.at(-1)?.id;
    if (users.length < BATCH_SIZE) break;
  } while (cursor);

  return { senderId: sender.id, queued };
}

export async function processAnnouncementDeliveries(announcementId: string) {
  const [announcement, sender] = await Promise.all([
    prisma.announcement.findUnique({ where: { id: announcementId }, select: { title: true, content: true } }),
    prisma.user.findUnique({ where: { id: SYSTEM_ANNOUNCEMENT_USER_ID }, select: { id: true } }),
  ]);
  if (!announcement || !sender) throw new Error("公告或平台公告账号不存在");

  const messageContent = `【${announcement.title}】\n\n${announcement.content}`;
  let delivered = 0;
  let failed = 0;

  const deliveries = await prisma.announcementDelivery.findMany({
      where: { announcementId, status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: 3 } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, userId: true },
    });
  for (const delivery of deliveries) {
      try {
        const wasDelivered = await prisma.$transaction(async (tx) => {
          const claimed = await tx.announcementDelivery.updateMany({
            where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: 3 } },
            data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastError: null },
          });
          if (claimed.count === 0) return false;

          const [participant1Id, participant2Id] = sender.id < delivery.userId
            ? [sender.id, delivery.userId]
            : [delivery.userId, sender.id];
          const thread = await tx.dMThread.upsert({
            where: { participant1Id_participant2Id: { participant1Id, participant2Id } },
            update: { isSystemReadOnly: true },
            create: { participant1Id, participant2Id, isSystemReadOnly: true },
          });
          const message = await tx.dMMessage.create({
            data: { threadId: thread.id, senderId: sender.id, content: messageContent },
          });
          await tx.dMThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
          await tx.announcementDelivery.update({
            where: { id: delivery.id },
            data: { status: "DELIVERED", threadId: thread.id, messageId: message.id, deliveredAt: new Date() },
          });
          await tx.notification.create({
            data: {
              userId: delivery.userId,
              type: "SYSTEM",
              title: announcement.title,
              content: "平台向您发送了一条公告私信",
              link: `/messages/dm/${thread.id}`,
            },
          });
          return true;
        }, { timeout: 15_000 });
        if (wasDelivered) delivered += 1;
      } catch (error) {
        failed += 1;
        await prisma.announcementDelivery.updateMany({
          where: { id: delivery.id, status: { in: ["PENDING", "FAILED", "PROCESSING"] }, attemptCount: { lt: 3 } },
          data: {
            status: "FAILED",
            attemptCount: { increment: 1 },
            lastError: error instanceof Error ? error.message.slice(0, 500) : "投递失败",
          },
        });
      }
  }

  const remaining = await prisma.announcementDelivery.count({
    where: { announcementId, status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: 3 } },
  });
  return { delivered, failed, remaining };
}
