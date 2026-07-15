/**
 * DCR 三方互助循环 — 业务逻辑引擎
 *
 * A→B, B→C, C→A 闭环互助
 * 状态机: INITIATING → ACTIVE → COMPLETED / BROKEN
 */

import prisma from "@/lib/prisma";
import { CycleMode, CycleStatus, LinkStatus } from "@prisma/client";
import { createNotification } from "@/lib/notification";

/* ========== Types ========== */

export interface CycleCreateInput {
  /** A (发起者 = 当前用户) */
  initiatorId: string;
  /** B (A 帮助 B) */
  participantBId: string;
  /** C (B 帮助 C) */
  participantCId?: string;
  /** 双方闭环 A→B→A 或三方闭环 A→B→C→A */
  mode?: CycleMode;
  /** 每段互助的说明 */
  descriptions?: {
    AB?: string;
    BA?: string;
    BC?: string;
    CA?: string;
  };
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  newCycleStatus?: CycleStatus;
}

export interface ThreePartyMatchInput {
  userId: string;
  needText?: string;
  offerText?: string;
}

export function buildCycleDirections(
  mode: CycleMode,
  initiatorId: string,
  participantBId: string,
  participantCId?: string,
  descriptions?: CycleCreateInput["descriptions"],
) {
  if (mode === CycleMode.THREE_PARTY) {
    if (!participantCId) throw new Error("三方互助需要选择 C 方");
    return [
      { dir: "AB", from: initiatorId, to: participantBId, desc: descriptions?.AB },
      { dir: "BC", from: participantBId, to: participantCId, desc: descriptions?.BC },
      { dir: "CA", from: participantCId, to: initiatorId, desc: descriptions?.CA },
    ];
  }
  return [
    { dir: "AB", from: initiatorId, to: participantBId, desc: descriptions?.AB },
    { dir: "BA", from: participantBId, to: initiatorId, desc: descriptions?.BA },
  ];
}

/* ========== Constants ========== */

/** 状态流转映射 */
const LINK_TRANSITIONS: Record<LinkStatus, LinkStatus[]> = {
  PENDING_REQUEST: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["IN_PROGRESS", "REJECTED", "DISPUTED"],
  IN_PROGRESS: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  REJECTED: [],
  DISPUTED: [],
};

const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  INITIATING: ["ACTIVE", "BROKEN"],
  ACTIVE: ["COMPLETED", "BROKEN"],
  COMPLETED: [],
  BROKEN: [],
};

/* ========== Validation ========== */

/**
 * 验证三方是否互异
 */
export function validateParticipants(
  initiatorId: string,
  bId: string,
  cId: string,
): string | null {
  if (initiatorId === bId || initiatorId === cId || bId === cId) {
    return "三方互助循环需要三个不同的参与者";
  }
  return null;
}

/**
 * 检查用户是否已有活跃的互助循环 (同一用户不得同时参与多个活跃循环)
 */
export async function hasActiveCycle(userId: string): Promise<boolean> {
  const activeStatuses: CycleStatus[] = ["INITIATING", "ACTIVE"];
  const count = await prisma.mutualAidCycle.count({
    where: {
      status: { in: activeStatuses },
      OR: [
        { initiatorId: userId },
        { links: { some: { fromUserId: userId, status: { notIn: ["REJECTED"] } } } },
        { links: { some: { toUserId: userId, status: { notIn: ["REJECTED"] } } } },
      ],
    },
  });
  return count > 0;
}

/* ========== State Machine ========== */

/**
 * 检查 Link 状态流转是否合法
 */
export function canTransitionLink(from: LinkStatus, to: LinkStatus): TransitionResult {
  const allowed = LINK_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return {
      allowed: false,
      reason: `不允许从 ${from} 转换为 ${to}`,
    };
  }
  return { allowed: true };
}

/**
 * 检查 Cycle 状态流转是否合法
 */
export function canTransitionCycle(from: CycleStatus, to: CycleStatus): TransitionResult {
  const allowed = CYCLE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return {
      allowed: false,
      reason: `不允许从 ${from} 转换为 ${to}`,
    };
  }
  return { allowed: true };
}

/* ========== Core Operations ========== */

/**
 * 创建三方互助循环。
 * 返回 created cycle with links
 */
export async function createCycle(input: CycleCreateInput) {
  const { initiatorId, participantBId, participantCId, descriptions } = input;
  const mode = input.mode ?? CycleMode.THREE_PARTY;

  const error = mode === CycleMode.THREE_PARTY
    ? participantCId
      ? validateParticipants(initiatorId, participantBId, participantCId)
      : "三方互助需要选择 C 方"
    : initiatorId === participantBId
      ? "双方互助需要两个不同的参与者"
      : null;
  if (error) throw new Error(error);

  // 批量检查所有参与者是否有活跃循环（一次查询替代三次串行查询）
  const activeStatuses: CycleStatus[] = ["INITIATING", "ACTIVE"];
  const userIds = mode === CycleMode.THREE_PARTY
    ? [initiatorId, participantBId, participantCId!]
    : [initiatorId, participantBId];
  const conflicting = await prisma.mutualAidCycle.findFirst({
    where: {
      status: { in: activeStatuses },
      OR: [
        { initiatorId: { in: userIds } },
        { links: { some: { fromUserId: { in: userIds }, status: { notIn: ["REJECTED"] } } } },
        { links: { some: { toUserId: { in: userIds }, status: { notIn: ["REJECTED"] } } } },
      ],
    },
    select: {
      initiatorId: true,
      links: {
        where: {
          OR: [
            { fromUserId: { in: userIds } },
            { toUserId: { in: userIds } },
          ],
        },
        select: { fromUserId: true, toUserId: true },
        take: 1,
      },
    },
  });

  if (conflicting) {
    const involvedSet = new Set<string>();
    if (userIds.includes(conflicting.initiatorId)) involvedSet.add(conflicting.initiatorId);
    for (const link of conflicting.links) {
      if (userIds.includes(link.fromUserId)) involvedSet.add(link.fromUserId);
      if (userIds.includes(link.toUserId)) involvedSet.add(link.toUserId);
    }
    const uid = [...involvedSet][0] ?? userIds[0];
    throw new Error(`用户 ${uid} 已有活跃的互助循环，请先完成或退出`);
  }

  // 验证参与者真实存在且已通过考核
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, quizPassed: true, dcrAccess: true, role: true },
  });
  if (users.length !== userIds.length) throw new Error("部分参与者不存在");

  for (const u of users) {
    const isAdministrator = u.role === "ADMIN" || u.role === "SUPER_ADMIN";
    if (!isAdministrator && (!u.quizPassed || !u.dcrAccess)) {
      throw new Error(`用户 ${u.id} 尚未通过入频考核，无法参与互助循环`);
    }
  }

  // 创建循环 + 三段链接 (事务)
  const cycle = await prisma.$transaction(async (tx) => {
    const c = await tx.mutualAidCycle.create({
      data: {
        initiatorId,
        status: "INITIATING",
        mode,
      },
    });

    const directions = buildCycleDirections(mode, initiatorId, participantBId, participantCId, descriptions);

    for (const { dir, from, to, desc } of directions) {
      await tx.mutualAidLink.create({
        data: {
          cycleId: c.id,
          direction: dir,
          fromUserId: from,
          toUserId: to,
          status: "PENDING_REQUEST",
          description: desc ?? null,
        },
      });
    }

    await tx.user.update({
      where: { id: initiatorId },
      data: { dcrHelperAccess: true },
    });

    return c;
  });

  const invitedUserIds = userIds.filter((id) => id !== initiatorId);
  const notificationResults = await Promise.allSettled(invitedUserIds.map((userId) =>
    createNotification(
      userId,
      "SYSTEM",
      mode === CycleMode.THREE_PARTY ? "收到三方互助邀请" : "收到双方互助邀请",
      mode === CycleMode.THREE_PARTY ? "有人邀请您加入 A→B→C→A 互助闭环" : "有人邀请您加入 A→B→A 双方互助闭环",
      `/dcr/cycles/${cycle.id}`,
    ),
  ));
  if (notificationResults.some((result) => result.status === "rejected")) {
    console.error("Failed to create one or more mutual aid invitations", { cycleId: cycle.id });
  }

  return cycle;
}

/**
 * Register willingness for a three-party cycle and let the system choose B/C.
 * Other waiting users are preferred; available administrators fill remaining
 * seats so no participant IDs are supplied by the requester.
 */
export async function enqueueThreePartyMatch(input: ThreePartyMatchInput) {
  if (await hasActiveCycle(input.userId)) {
    throw new Error("你已有活跃的互助循环，请先完成或退出");
  }

  const requester = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, quizPassed: true, dcrAccess: true, role: true },
  });
  if (!requester) throw new Error("用户不存在");
  const requesterIsAdmin = requester.role === "ADMIN" || requester.role === "SUPER_ADMIN";
  if (!requesterIsAdmin && (!requester.quizPassed || !requester.dcrAccess)) {
    throw new Error("尚未通过入频考核，无法参与三方互助匹配");
  }

  const request = await prisma.mutualAidMatchRequest.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      status: "WAITING",
      needText: input.needText?.trim() || null,
      offerText: input.offerText?.trim() || null,
    },
    update: {
      status: "WAITING",
      matchedCycleId: null,
      needText: input.needText?.trim() || null,
      offerText: input.offerText?.trim() || null,
    },
  });

  const activeStatuses: CycleStatus[] = ["INITIATING", "ACTIVE"];
  const waiting = await prisma.mutualAidMatchRequest.findMany({
    where: {
      status: "WAITING",
      userId: { not: input.userId },
      user: {
        initiatedCycles: { none: { status: { in: activeStatuses } } },
        linksAsFrom: { none: { cycle: { status: { in: activeStatuses } } } },
        linksAsTo: { none: { cycle: { status: { in: activeStatuses } } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, userId: true, offerText: true },
  });

  const participants: Array<{ userId: string; requestId?: string; offerText?: string | null }> = [
    { userId: input.userId, requestId: request.id, offerText: request.offerText },
    ...waiting.map((item) => ({ userId: item.userId, requestId: item.id, offerText: item.offerText })),
  ];

  if (participants.length < 3) {
    const administrators = await prisma.user.findMany({
      where: {
        id: { notIn: participants.map((item) => item.userId) },
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        isBanned: false,
        initiatedCycles: { none: { status: { in: activeStatuses } } },
        linksAsFrom: { none: { cycle: { status: { in: activeStatuses } } } },
        linksAsTo: { none: { cycle: { status: { in: activeStatuses } } } },
      },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      take: 3 - participants.length,
      select: { id: true },
    });
    participants.push(...administrators.map((admin) => ({
      userId: admin.id,
      offerText: "管理员协助",
    })));
  }

  if (participants.length < 3) {
    return { matched: false as const, request, cycle: null };
  }

  const claimedIds = participants.flatMap((item) => item.requestId ? [item.requestId] : []);
  const claimed = await prisma.mutualAidMatchRequest.updateMany({
    where: { id: { in: claimedIds }, status: "WAITING" },
    data: { status: "MATCHING" },
  });
  if (claimed.count !== claimedIds.length) {
    await prisma.mutualAidMatchRequest.updateMany({
      where: { id: { in: claimedIds }, status: "MATCHING" },
      data: { status: "WAITING" },
    });
    return { matched: false as const, request, cycle: null };
  }

  try {
    const [a, b, c] = participants;
    const cycle = await createCycle({
      initiatorId: a.userId,
      mode: CycleMode.THREE_PARTY,
      participantBId: b.userId,
      participantCId: c.userId,
      descriptions: {
        AB: a.offerText || undefined,
        BC: b.offerText || undefined,
        CA: c.offerText || undefined,
      },
    });
    await prisma.mutualAidMatchRequest.updateMany({
      where: { id: { in: claimedIds } },
      data: { status: "MATCHED", matchedCycleId: cycle.id },
    });
    return { matched: true as const, request, cycle };
  } catch (error) {
    await prisma.mutualAidMatchRequest.updateMany({
      where: { id: { in: claimedIds }, status: "MATCHING" },
      data: { status: "WAITING" },
    });
    throw error;
  }
}

/**
 * 接受 (或拒绝) 一段互助链接。
 * toUser 才能 ACCEPT/REJECT
 */
export async function respondToLink(
  linkId: string,
  userId: string,
  action: "ACCEPTED" | "REJECTED",
) {
  const link = await prisma.mutualAidLink.findUnique({
    where: { id: linkId },
    include: { cycle: true },
  });

  if (!link) throw new Error("链接不存在");
  if (link.toUserId !== userId) throw new Error("只有接收方可以响应互助请求");

  if (action === "REJECTED") {
    // 拒绝 → 标记该 Link + Cycle → BROKEN
    await prisma.$transaction([
      prisma.mutualAidLink.update({
        where: { id: linkId },
        data: { status: LinkStatus.REJECTED, breakReason: "接收方拒绝" },
      }),
      prisma.mutualAidCycle.update({
        where: { id: link.cycleId },
        data: { status: CycleStatus.BROKEN },
      }),
    ]);
    return { cycleStatus: "BROKEN" as const, linkStatus: "REJECTED" as const };
  }

  // ACCEPTED
  const result = canTransitionLink(link.status, "ACCEPTED");
  if (!result.allowed) throw new Error(result.reason);

  await prisma.$transaction([
    prisma.mutualAidLink.update({
      where: { id: linkId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { dcrHelperAccess: true },
    }),
  ]);

  // 检查是否所有 3 段都已 ACCEPTED → ACTIVE
  await maybeActivateCycle(link.cycleId);

  return { cycleStatus: link.cycle.status as CycleStatus, linkStatus: "ACCEPTED" as const };
}

/**
 * 从 Link 更新进度 (IN_PROGRESS / COMPLETED)。
 * fromUser 才能操作。
 */
export async function updateLinkProgress(
  linkId: string,
  userId: string,
  newStatus: "IN_PROGRESS" | "COMPLETED",
) {
  const link = await prisma.mutualAidLink.findUnique({
    where: { id: linkId },
    include: { cycle: true },
  });

  if (!link) throw new Error("链接不存在");
  if (link.fromUserId !== userId) throw new Error("只有发起方可以更新互助进度");

  const result = canTransitionLink(link.status, newStatus);
  if (!result.allowed) throw new Error(result.reason);

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  await prisma.mutualAidLink.update({
    where: { id: linkId },
    data: updateData,
  });

  // 如果完成 → 检查是否全部完成
  if (newStatus === "COMPLETED") {
    await maybeCompleteCycle(link.cycleId);
  }

  return { cycleStatus: link.cycle.status as CycleStatus, linkStatus: newStatus };
}

/**
 * 发起争议 (fromUser 或 toUser 均可)
 */
export async function disputeLink(linkId: string, userId: string, reason: string) {
  const link = await prisma.mutualAidLink.findUnique({
    where: { id: linkId },
    include: { cycle: true },
  });

  if (!link) throw new Error("链接不存在");
  if (link.fromUserId !== userId && link.toUserId !== userId) {
    throw new Error("只有参与者可以发起争议");
  }

  const result = canTransitionLink(link.status, "DISPUTED");
  if (!result.allowed) throw new Error(result.reason);

  await prisma.$transaction([
    prisma.mutualAidLink.update({
      where: { id: linkId },
      data: { status: "DISPUTED", breakReason: reason },
    }),
    prisma.mutualAidCycle.update({
      where: { id: link.cycleId },
      data: { status: "BROKEN" },
    }),
  ]);

  return { cycleStatus: "BROKEN" as const, linkStatus: "DISPUTED" as const };
}

/**
 * 管理员修复 — 重置 BROKEN 循环中的一段链接
 */
export async function repairLink(
  cycleId: string,
  linkId: string,
  newFromUserId: string,
  newToUserId: string,
) {
  const cycle = await prisma.mutualAidCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new Error("循环不存在");

  const link = await prisma.mutualAidLink.findUnique({
    where: { id: linkId },
  });
  if (!link) throw new Error("链接不存在");
  if (link.cycleId !== cycleId) throw new Error("链接不属于此循环");

  const error = validateParticipants(
    cycle.initiatorId,
    // 根据 direction 重新组装参与方
    // 实际上是管理员强制替换，这里简化处理
    link.fromUserId,
    newToUserId,
  );
  // 管理员修复允许重参与方，跳过互异校验

  return prisma.$transaction([
    prisma.mutualAidLink.update({
      where: { id: linkId },
      data: {
        fromUserId: newFromUserId,
        toUserId: newToUserId,
        status: "PENDING_REQUEST",
        acceptedAt: null,
        completedAt: null,
        breakReason: null,
      },
    }),
    prisma.mutualAidCycle.update({
      where: { id: cycleId },
      data: { status: "INITIATING" },
    }),
  ]);
}

/* ========== Internal Helpers ========== */

/**
 * 当所有 3 段 Link 都 ACCEPTED → ACTIVATE
 */
async function maybeActivateCycle(cycleId: string) {
  const links = await prisma.mutualAidLink.findMany({
    where: { cycleId },
  });

  const allAccepted = links.length >= 2 && links.every((l) => l.status === "ACCEPTED");
  if (allAccepted) {
    await prisma.mutualAidCycle.update({
      where: { id: cycleId },
      data: { status: "ACTIVE" },
    });
  }
}

/**
 * 当所有 3 段 Link 都 COMPLETED → COMPLETE
 */
async function maybeCompleteCycle(cycleId: string) {
  const links = await prisma.mutualAidLink.findMany({
    where: { cycleId },
  });

  const allCompleted = links.length >= 2 && links.every((l) => l.status === "COMPLETED");
  if (allCompleted) {
    await prisma.mutualAidCycle.update({
      where: { id: cycleId },
      data: { status: "COMPLETED" },
    });
  }
}
