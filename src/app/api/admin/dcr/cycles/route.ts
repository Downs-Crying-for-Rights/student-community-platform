import { NextResponse } from "next/server";
import { z } from "zod";
import type { CycleStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createCycle } from "@/lib/mutual-aid-cycle";
import {
  buildCycleRecommendations,
  type CycleCandidate,
} from "@/lib/mutual-aid-cycle-recommendation";

const assignSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ASSIGN"),
    participantAId: z.string().min(1),
    participantBId: z.string().min(1),
    participantCId: z.string().min(1),
  }),
  z.object({ action: z.literal("AUTO_ASSIGN") }),
]);

const activeStatuses: CycleStatus[] = ["INITIATING", "ACTIVE"];
const activeCycleFilter: Prisma.UserWhereInput = {
  OR: [
    { initiatedCycles: { some: { status: { in: activeStatuses } } } },
    { linksAsFrom: { some: { cycle: { status: { in: activeStatuses } } } } },
    { linksAsTo: { some: { cycle: { status: { in: activeStatuses } } } } },
  ],
};

async function loadCandidates(): Promise<CycleCandidate[]> {
  const [users, requests] = await Promise.all([
    prisma.user.findMany({
      where: {
        isBanned: false,
        NOT: activeCycleFilter,
        OR: [
          { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
          { dcrAccess: true, quizPassed: true },
        ],
      },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      take: 50,
      select: { id: true, nickname: true, role: true },
    }),
    prisma.mutualAidMatchRequest.findMany({
      where: { status: "WAITING" },
      select: { userId: true, needText: true, offerText: true, createdAt: true },
    }),
  ]);
  const requestByUser = new Map(requests.map((request) => [request.userId, request]));
  return users.map((user) => {
    const request = requestByUser.get(user.id);
    return {
      ...user,
      needText: request?.needText ?? null,
      offerText: request?.offerText ?? null,
      waitingSince: request?.createdAt.toISOString() ?? null,
    };
  });
}

export const GET = withAuth(async () => {
  try {
    const [candidates, cycles] = await Promise.all([
      loadCandidates(),
      prisma.mutualAidCycle.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          initiator: { select: { id: true, nickname: true } },
          links: {
            include: {
              fromUser: { select: { id: true, nickname: true } },
              toUser: { select: { id: true, nickname: true } },
            },
          },
        },
      }),
    ]);
    return NextResponse.json({
      cycles,
      candidates,
      recommendations: buildCycleRecommendations(candidates),
    });
  } catch (error) {
    console.error("GET /api/admin/dcr/cycles error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN", { captureAllTelemetry: true });

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const parsed = assignSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten() }, { status: 400 });
    }

    const candidates = await loadCandidates();
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    let participantIds: [string, string, string];
    if (parsed.data.action === "AUTO_ASSIGN") {
      const recommendation = buildCycleRecommendations(candidates, 1)[0];
      if (!recommendation) {
        return NextResponse.json({ error: "当前不足 3 名可分配对象" }, { status: 409 });
      }
      participantIds = recommendation.participants.map((item) => item.id) as [string, string, string];
    } else {
      participantIds = [
        parsed.data.participantAId,
        parsed.data.participantBId,
        parsed.data.participantCId,
      ];
      if (new Set(participantIds).size !== 3) {
        return NextResponse.json({ error: "A、B、C 必须是三个不同用户" }, { status: 400 });
      }
      if (participantIds.some((id) => !candidateIds.has(id))) {
        return NextResponse.json({ error: "所选用户不存在、未通过准入或已有活跃循环" }, { status: 409 });
      }
    }

    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const [a, b, c] = participantIds.map((id) => candidateById.get(id)!);
    const cycle = await createCycle({
      initiatorId: a.id,
      participantBId: b.id,
      participantCId: c.id,
      mode: "THREE_PARTY",
      descriptions: {
        AB: a.offerText || "由管理员分配的互助段",
        BC: b.offerText || "由管理员分配的互助段",
        CA: c.offerText || "由管理员分配的互助段",
      },
    });

    await prisma.mutualAidMatchRequest.updateMany({
      where: { userId: { in: participantIds }, status: { in: ["WAITING", "MATCHING"] } },
      data: { status: "MATCHED", matchedCycleId: cycle.id },
    });

    return NextResponse.json({ cycle, participantIds }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/dcr/cycles error:", error);
    const message = error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json({ error: message }, { status: message.includes("活跃") ? 409 : 500 });
  }
}, "ADMIN", { captureAllTelemetry: true });
