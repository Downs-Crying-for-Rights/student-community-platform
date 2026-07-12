/**
 * DCR 三方互助循环 — 业务逻辑引擎
 *
 * A→B, B→C, C→A 闭环互助
 * 状态机: INITIATING → ACTIVE → COMPLETED / BROKEN
 */

import prisma from "@/lib/prisma";
import type { CycleStatus, LinkStatus } from "@prisma/client";

/* ========== Types ========== */

export interface CycleCreateInput {
  /** A (发起者 = 当前用户) */
  initiatorId: string;
  /** B (A 帮助 B) */
  participantBId: string;
  /** C (B 帮助 C) */
  participantCId: string;
  /** 每段互助的说明 */
  descriptions?: {
    AB?: string;
    BC?: string;
    CA?: string;
  };
}

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  newCycleStatus?: CycleStatus;
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

  // 验证参与者互异
  const error = validateParticipants(initiatorId, participantBId, participantCId);
  if (error) throw new Error(error);

  // 检查所有参与者是否有活跃循环
  for (const uid of [initiatorId, participantBId, participantCId]) {
    if (await hasActiveCycle(uid)) {
      throw new Error(`用户 ${uid} 已有活跃的互助循环，请先完成或退出`);
    }
  }

  // 验证参与者真实存在且已通过考核
  const users = await prisma.user.findMany({
    where: { id: { in: [initiatorId, participantBId, participantCId] } },
    select: { id: true, quizPassed: true, dcrAccess: true },
  });
  if (users.length !== 3) throw new Error("部分参与者不存在");

  for (const u of users) {
    if (!u.quizPassed || !u.dcrAccess) {
      throw new Error(`用户 ${u.id} 尚未通过入频考核，无法参与互助循环`);
    }
  }

  // 创建循环 + 三段链接 (事务)
  const cycle = await prisma.$transaction(async (tx) => {
    const c = await tx.mutualAidCycle.create({
      data: {
        initiatorId,
        status: "INITIATING",
      },
    });

    // 三段方向: A(initiator)→B, B→C, C→A
    const directions: { dir: string; from: string; to: string; desc?: string }[] = [
      { dir: "AB", from: initiatorId, to: participantBId, desc: descriptions?.AB },
      { dir: "BC", from: participantBId, to: participantCId, desc: descriptions?.BC },
      { dir: "CA", from: participantCId, to: initiatorId, desc: descriptions?.CA },
    ];

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

    return c;
  });

  return cycle;
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
        data: { status: "REJECTED", breakReason: "接收方拒绝" },
      }),
      prisma.mutualAidCycle.update({
        where: { id: link.cycleId },
        data: { status: "BROKEN" },
      }),
    ]);
    return { cycleStatus: "BROKEN" as const, linkStatus: "REJECTED" as const };
  }

  // ACCEPTED
  const result = canTransitionLink(link.status, "ACCEPTED");
  if (!result.allowed) throw new Error(result.reason);

  await prisma.mutualAidLink.update({
    where: { id: linkId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

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

  const allAccepted = links.length === 3 && links.every((l) => l.status === "ACCEPTED");
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

  const allCompleted = links.length === 3 && links.every((l) => l.status === "COMPLETED");
  if (allCompleted) {
    await prisma.mutualAidCycle.update({
      where: { id: cycleId },
      data: { status: "COMPLETED" },
    });
  }
}
