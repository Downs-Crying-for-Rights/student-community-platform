import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { requireDMConsent } from "@/lib/dm-consent";
import prisma from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { type AuthenticatedRequest, withAuth } from "@/lib/rbac";

export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  const userId = req.user.id;
  const consent = await requireDMConsent(userId);
  if (consent) {
    return NextResponse.json(
      { error: "使用私信前需要同意私信巡查授权", code: "DM_CONSENT_REQUIRED", consent },
      { status: 428 },
    );
  }

  const rateLimited = await enforceRateLimit(`dm-thread-create:${userId}`, 20, 60_000);
  if (rateLimited) return rateLimited.response as unknown as NextResponse;

  const link = await prisma.mutualAidLink.findFirst({
    where: {
      id: context.params.linkId,
      cycleId: context.params.id,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
    select: { id: true, cycleId: true, fromUserId: true, toUserId: true },
  });
  if (!link) {
    return NextResponse.json({ error: "互助关系不存在或无权联系" }, { status: 404 });
  }

  const participantId = link.fromUserId === userId ? link.toUserId : link.fromUserId;
  if (participantId === userId) {
    return NextResponse.json({ error: "不能给自己发私信" }, { status: 400 });
  }
  const [participant1Id, participant2Id] = userId < participantId
    ? [userId, participantId]
    : [participantId, userId];
  const thread = await prisma.dMThread.upsert({
    where: { participant1Id_participant2Id: { participant1Id, participant2Id } },
    update: {},
    create: { participant1Id, participant2Id },
  });

  await logAudit(userId, "DM_THREAD_OPEN", "DM_THREAD", thread.id, {
    participantId,
    cycleId: link.cycleId,
    linkId: link.id,
  });
  return NextResponse.json({ thread });
}, undefined, { captureAllTelemetry: true });
