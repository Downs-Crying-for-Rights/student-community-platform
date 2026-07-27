/**
 * DCR 三方互助循环 — 业务逻辑引擎
 *
 * A→B, B→C, C→A 闭环互助
 * 状态机: INITIATING → ACTIVE → COMPLETED / BROKEN
 */

import prisma from "@/lib/prisma";
import { CycleMode, CycleStatus, LinkStatus, type Prisma } from "@prisma/client";
import { createNotification } from "@/lib/notification";
import { canParticipateInDcrWorkflow } from "@/lib/dcr-capabilities";

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
  CLOSED: [],
};

const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  INITIATING: ["ACTIVE", "BROKEN"],
  ACTIVE: ["COMPLETED", "BROKEN"],
  COMPLETED: [],
  BROKEN: [],
  CLOSED: [],
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
    select: { id: true, dcrAccess: true, dcrPledgeSigned: true, role: true },
  });
  if (users.length !== userIds.length) throw new Error("部分参与者不存在");

  for (const u of users) {
    if (!canParticipateInDcrWorkflow(u)) {
      throw new Error(`用户 ${u.id} 尚未完成 DCR 准入或守则签署，无法参与互助循环`);
    }
  }

  // 创建循环 + 三段链接 (事务)
  const cycle = await prisma.$transaction(async (tx) => {
    for (const participantId of [...userIds].sort()) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-participant:${participantId}`}))`;
    }
    const lockedConflict = await tx.mutualAidCycle.findFirst({
      where: {
        status: { in: activeStatuses },
        OR: [
          { initiatorId: { in: userIds } },
          { links: { some: { fromUserId: { in: userIds }, status: { notIn: ["REJECTED"] } } } },
          { links: { some: { toUserId: { in: userIds }, status: { notIn: ["REJECTED"] } } } },
        ],
      },
      select: { id: true },
    });
    if (lockedConflict) throw new Error("部分参与者已加入活跃的互助循环，请先完成或退出");

    const lockedUsers = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, dcrAccess: true, dcrPledgeSigned: true, role: true },
    });
    if (lockedUsers.length !== userIds.length) throw new Error("部分参与者不存在");
    for (const participant of lockedUsers) {
      if (!canParticipateInDcrWorkflow(participant)) {
        throw new Error(`用户 ${participant.id} 尚未完成 DCR 准入或守则签署，无法参与互助循环`);
      }
    }

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
    select: { id: true, dcrAccess: true, dcrPledgeSigned: true, role: true },
  });
  if (!requester) throw new Error("用户不存在");
  if (!canParticipateInDcrWorkflow(requester)) {
    throw new Error("尚未完成 DCR 准入或守则签署，无法参与三方互助匹配");
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
        OR: [
          { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
          { dcrAccess: true, dcrPledgeSigned: true },
        ],
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
  return prisma.$transaction(async (tx) => {
    const initial = await tx.mutualAidLink.findUnique({ where: { id: linkId }, select: { cycleId: true } });
    if (!initial) throw new Error("链接不存在");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-cycle:${initial.cycleId}`}))`;
    const link = await tx.mutualAidLink.findUnique({ where: { id: linkId }, include: { cycle: true } });
    if (!link) throw new Error("链接不存在");
    if (link.toUserId !== userId) throw new Error("只有接收方可以响应互助请求");
    const transition = canTransitionLink(link.status, action);
    if (!transition.allowed) throw new Error(transition.reason);

    if (action === "REJECTED") {
      const updated = await tx.mutualAidLink.updateMany({
        where: { id: linkId, status: link.status },
        data: { status: LinkStatus.REJECTED, breakReason: "接收方拒绝" },
      });
      if (updated.count !== 1) throw new Error("互助关系状态已变化，请刷新后重试");
      await tx.mutualAidCycle.update({
        where: { id: link.cycleId },
        data: { status: CycleStatus.BROKEN },
      });
      return { cycleStatus: "BROKEN" as const, linkStatus: "REJECTED" as const };
    }

    const updated = await tx.mutualAidLink.updateMany({
      where: { id: linkId, status: link.status },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("互助关系状态已变化，请刷新后重试");
    await tx.user.update({
      where: { id: userId },
      data: { dcrHelperAccess: true },
    });
    const links = await tx.mutualAidLink.findMany({ where: { cycleId: link.cycleId }, select: { status: true } });
    const cycleStatus = aggregateCycleLinkStatus(links.map((item) => item.status));
    await tx.mutualAidCycle.update({ where: { id: link.cycleId }, data: { status: cycleStatus } });
    return { cycleStatus, linkStatus: "ACCEPTED" as const };
  });
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
  return prisma.$transaction(async (tx) => {
    const initial = await tx.mutualAidLink.findUnique({ where: { id: linkId }, select: { cycleId: true } });
    if (!initial) throw new Error("链接不存在");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-cycle:${initial.cycleId}`}))`;
    const link = await tx.mutualAidLink.findUnique({ where: { id: linkId } });
    if (!link) throw new Error("链接不存在");
    if (link.fromUserId !== userId) throw new Error("只有发起方可以更新互助进度");
    const transition = canTransitionLink(link.status, newStatus);
    if (!transition.allowed) throw new Error(transition.reason);
    const updated = await tx.mutualAidLink.updateMany({
      where: { id: linkId, status: link.status },
      data: { status: newStatus, ...(newStatus === "COMPLETED" ? { completedAt: new Date() } : {}) },
    });
    if (updated.count !== 1) throw new Error("互助关系状态已变化，请刷新后重试");
    const links = await tx.mutualAidLink.findMany({ where: { cycleId: link.cycleId }, select: { status: true } });
    const cycleStatus = aggregateCycleLinkStatus(links.map((item) => item.status));
    await tx.mutualAidCycle.update({ where: { id: link.cycleId }, data: { status: cycleStatus } });
    return { cycleStatus, linkStatus: newStatus };
  });
}

/**
 * 发起争议 (fromUser 或 toUser 均可)
 */
export async function disputeLink(linkId: string, userId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.mutualAidLink.findUnique({ where: { id: linkId }, select: { cycleId: true } });
    if (!initial) throw new Error("链接不存在");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-cycle:${initial.cycleId}`}))`;
    const link = await tx.mutualAidLink.findUnique({ where: { id: linkId }, include: { cycle: true } });
    if (!link) throw new Error("链接不存在");
    if (link.fromUserId !== userId && link.toUserId !== userId) throw new Error("只有参与者可以发起争议");
    const transition = canTransitionLink(link.status, "DISPUTED");
    if (!transition.allowed) throw new Error(transition.reason);
    const updated = await tx.mutualAidLink.updateMany({
      where: { id: linkId, status: link.status },
      data: { status: "DISPUTED", statusBeforeDispute: link.status, breakReason: reason },
    });
    if (updated.count !== 1) throw new Error("互助关系状态已变化，请刷新后重试");
    await tx.mutualAidCycle.update({ where: { id: link.cycleId }, data: { status: "BROKEN" } });
    return { cycleStatus: "BROKEN" as const, linkStatus: "DISPUTED" as const };
  });
}

export type CycleDisputeResolutionAction = "resume" | "reinvite" | "close";

export function restoreCycleLinkStatus(
  statusBeforeDispute: LinkStatus | null,
  action: Exclude<CycleDisputeResolutionAction, "close">,
): LinkStatus {
  if (action === "reinvite") return LinkStatus.PENDING_REQUEST;
  return statusBeforeDispute === LinkStatus.IN_PROGRESS ? LinkStatus.IN_PROGRESS : LinkStatus.ACCEPTED;
}

export function aggregateCycleLinkStatus(statuses: LinkStatus[]): CycleStatus {
  if (statuses.includes(LinkStatus.DISPUTED) || statuses.includes(LinkStatus.REJECTED)) return CycleStatus.BROKEN;
  if (statuses.every((status) => status === LinkStatus.COMPLETED)) return CycleStatus.COMPLETED;
  if (statuses.includes(LinkStatus.CLOSED)) return CycleStatus.CLOSED;
  if (statuses.includes(LinkStatus.PENDING_REQUEST)) return CycleStatus.INITIATING;
  return CycleStatus.ACTIVE;
}

/** Resolve one disputed cycle link without replacing or deleting unrelated links. */
export async function resolveCycleDispute(
  cycleId: string,
  linkId: string,
  action: CycleDisputeResolutionAction,
  reason: string,
  onResolved?: (
    tx: Prisma.TransactionClient,
    result: { cycleStatus: CycleStatus; linkStatus: LinkStatus; participantIds: string[] },
  ) => Promise<void>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mutual-aid-cycle:${cycleId}`}))`;
    const link = await tx.mutualAidLink.findFirst({
      where: { id: linkId, cycleId },
      include: { cycle: { include: { links: true } } },
    });
    if (!link) throw new Error("互助关系不存在");
    if (!["DISPUTED", "REJECTED"].includes(link.status)) throw new Error("该中断已被其他管理员处理");
    if (link.status === "REJECTED" && action === "resume") {
      throw new Error("已拒绝的链路只能重新邀请或终止循环");
    }

    if (action === "close") {
      const claimed = await tx.mutualAidLink.updateMany({
        where: { id: linkId, cycleId, status: link.status },
        data: { status: "CLOSED", statusBeforeDispute: null, breakReason: reason },
      });
      if (claimed.count !== 1) throw new Error("该中断已被其他管理员处理");
      await tx.mutualAidLink.updateMany({
        where: { cycleId, id: { not: linkId }, status: { notIn: ["COMPLETED", "CLOSED"] } },
        data: { status: "CLOSED", statusBeforeDispute: null, breakReason: reason },
      });
      await tx.mutualAidCycle.update({ where: { id: cycleId }, data: { status: "CLOSED" } });
      const result = {
        cycleStatus: "CLOSED" as const,
        linkStatus: "CLOSED" as const,
        participantIds: [...new Set(link.cycle.links.flatMap((item) => [item.fromUserId, item.toUserId]))],
      };
      await onResolved?.(tx, result);
      return result;
    }

    const participantIds = [...new Set(link.cycle.links.flatMap((item) => [item.fromUserId, item.toUserId]))];
    const conflictingCycle = await tx.mutualAidCycle.findFirst({
      where: {
        id: { not: cycleId },
        status: { in: ["INITIATING", "ACTIVE"] },
        OR: [
          { initiatorId: { in: participantIds } },
          { links: { some: { fromUserId: { in: participantIds } } } },
          { links: { some: { toUserId: { in: participantIds } } } },
        ],
      },
      select: { id: true },
    });
    if (conflictingCycle) throw new Error("参与者已加入其他活跃循环，只能终止当前循环");

    if (action === "resume" && !link.statusBeforeDispute) {
      throw new Error("历史争议缺少原状态，请选择重新邀请或终止循环");
    }
    const restoredStatus = restoreCycleLinkStatus(link.statusBeforeDispute, action);
    const updated = await tx.mutualAidLink.updateMany({
      where: { id: linkId, cycleId, status: link.status },
      data: {
        status: restoredStatus,
        statusBeforeDispute: null,
        breakReason: null,
        ...(action === "reinvite" ? { acceptedAt: null, completedAt: null } : {}),
      },
    });
    if (updated.count !== 1) throw new Error("该争议已被其他管理员处理");

    const currentLinks = await tx.mutualAidLink.findMany({ where: { cycleId }, select: { status: true } });
    const statuses = currentLinks.map((item) => item.status);
    const cycleStatus = aggregateCycleLinkStatus(statuses);
    await tx.mutualAidCycle.update({ where: { id: cycleId }, data: { status: cycleStatus } });
    const result = {
      cycleStatus,
      linkStatus: restoredStatus,
      participantIds,
    };
    await onResolved?.(tx, result);
    return result;
  });
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
