import "server-only";
import prisma from "@/lib/prisma";
import type { AiReviewTarget } from "./schemas";

export interface LoadedAiReviewTarget {
  targetType: AiReviewTarget;
  targetId: string;
  targetVersion: string;
  feature: string;
  containsPrivateData: boolean;
  complex: boolean;
  payload: unknown;
}

function minimizeCaseFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const locationKeys = new Set(["schoolName", "schoolAddress", "province", "city", "exactLocation"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
    key,
    locationKeys.has(key) ? `[${key.toUpperCase()}_PRESENT]` : fieldValue,
  ]));
}

export async function loadAiReviewTarget(targetType: AiReviewTarget, id: string): Promise<LoadedAiReviewTarget | null> {
  if (targetType === "POST") {
    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true, title: true, content: true, summary: true, visibility: true, isAnonymous: true, updatedAt: true,
        board: { select: { name: true, zone: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    if (!post) return null;
    return {
      targetType, targetId: id, targetVersion: post.updatedAt.toISOString(), feature: "content_moderation",
      containsPrivateData: post.board.zone !== "PUBLIC", complex: false,
      payload: {
        title: post.title, content: post.content, summary: post.summary, visibility: post.visibility,
        anonymous: post.isAnonymous, board: post.board, tags: post.tags.map((item) => item.tag.name),
      },
    };
  }

  if (targetType === "POST_REVISION") {
    const revision = await prisma.postRevision.findUnique({
      where: { id },
      include: { post: { select: { title: true, content: true, updatedAt: true, board: { select: { name: true, zone: true } } } } },
    });
    if (!revision) return null;
    return {
      targetType, targetId: id, targetVersion: `${revision.createdAt.toISOString()}:${revision.post.updatedAt.toISOString()}`,
      feature: "post_revision_moderation", containsPrivateData: revision.post.board.zone !== "PUBLIC", complex: false,
      payload: {
        board: revision.post.board,
        current: { title: revision.post.title, content: revision.post.content },
        proposed: { title: revision.title, content: revision.content, summary: revision.summary, visibility: revision.visibility },
      },
    };
  }

  if (targetType === "REPORT") {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        targetPost: { select: { title: true, content: true, board: { select: { zone: true } } } },
        targetComment: { select: { content: true, post: { select: { board: { select: { zone: true } } } } } },
        targetTask: { select: { title: true, summary: true } },
        targetCaseMessage: { select: { content: true } },
        targetHelpMessage: { select: { content: true } },
        targetDmMessage: { select: { content: true } },
        targetChatMessage: { select: { content: true } },
        targetChatRoom: { select: { name: true, description: true } },
      },
    });
    if (!report) return null;
    const target = report.targetPost ?? report.targetComment ?? report.targetTask ?? report.targetCaseMessage
      ?? report.targetHelpMessage ?? report.targetDmMessage ?? report.targetChatMessage ?? report.targetChatRoom
      ?? { type: "USER_PROFILE" };
    const privateTarget = Boolean(report.targetCaseMessage || report.targetHelpMessage || report.targetDmMessage || report.targetTask)
      || Boolean(report.targetPost && report.targetPost.board.zone !== "PUBLIC")
      || Boolean(report.targetComment && report.targetComment.post.board.zone !== "PUBLIC");
    return {
      targetType, targetId: id, targetVersion: report.updatedAt.toISOString(), feature: "report_review",
      containsPrivateData: privateTarget, complex: true,
      payload: { reason: report.reason, details: report.details, target },
    };
  }

  if (targetType === "CASE") {
    const caseRecord = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true, updatedAt: true, category: true, extractedFields: true, missingFields: true,
        sensitiveHitCount: true, grade: true, timeRange: true, province: true, city: true, riskPreference: true,
      },
    });
    if (!caseRecord) return null;
    return {
      targetType, targetId: id, targetVersion: caseRecord.updatedAt.toISOString(), feature: "dcr_case_review",
      containsPrivateData: true, complex: true,
      payload: {
        category: caseRecord.category, extractedFields: minimizeCaseFields(caseRecord.extractedFields), missingFields: caseRecord.missingFields,
        sensitiveHitCount: caseRecord.sensitiveHitCount, grade: caseRecord.grade, timeRange: caseRecord.timeRange,
        locationProvided: Boolean(caseRecord.province || caseRecord.city), riskPreference: caseRecord.riskPreference,
      },
    };
  }

  if (targetType === "DISPUTE") {
    const task = await prisma.mutualAidTask.findUnique({
      where: { id },
      select: {
        id: true, updatedAt: true, title: true, summary: true, category: true, urgencyLevel: true,
        timeline: { orderBy: { createdAt: "asc" }, select: { action: true, oldStatus: true, newStatus: true, details: true, createdAt: true } },
      },
    });
    if (!task) return null;
    return {
      targetType, targetId: id, targetVersion: task.updatedAt.toISOString(), feature: "dcr_dispute_review",
      containsPrivateData: true, complex: true,
      payload: { title: task.title, summary: task.summary, category: task.category, urgency: task.urgencyLevel, timeline: task.timeline },
    };
  }

  const room = await prisma.chatRoom.findUnique({
    where: { id },
    select: { id: true, name: true, description: true, type: true, joinMode: true, updatedAt: true },
  });
  if (!room) return null;
  return {
    targetType, targetId: id, targetVersion: room.updatedAt.toISOString(), feature: "chat_room_review",
    containsPrivateData: false, complex: false,
    payload: { name: room.name, description: room.description, type: room.type, joinMode: room.joinMode },
  };
}
