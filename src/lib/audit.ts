import prisma from "./prisma";
import type { Prisma } from "@prisma/client";

/**
 * 审计日志操作类型常量
 * 覆盖需求 16.1 中定义的所有敏感操作
 */
export const AuditAction = {
  // 用户管理
  ROLE_CHANGE: "ROLE_CHANGE",
  USER_BAN: "USER_BAN",
  USER_UNBAN: "USER_UNBAN",
  SHADOW_BAN: "SHADOW_BAN",

  // 内容审核
  CONTENT_APPROVE: "CONTENT_APPROVE",
  CONTENT_REJECT: "CONTENT_REJECT",

  // 举报处理
  REPORT_RESOLVE: "REPORT_RESOLVE",
  REPORT_DISMISS: "REPORT_DISMISS",

  // DCR 区
  DCR_ACCESS_GRANT: "DCR_ACCESS_GRANT",
  DCR_ACCESS_REVOKE: "DCR_ACCESS_REVOKE",
  CASE_EXPORT: "CASE_EXPORT",
  CASE_ACCESS: "CASE_ACCESS",

  // 板块权限
  BOARD_PERMISSION_CHANGE: "BOARD_PERMISSION_CHANGE",

  // 心理区
  PSYCH_ACCESS_GRANT: "PSYCH_ACCESS_GRANT",

  // 邀请码
  INVITE_CREATE: "INVITE_CREATE",
  INVITE_REVOKE: "INVITE_REVOKE",

  // 超级管理员
  SUPER_ADMIN_OVERRIDE: "SUPER_ADMIN_OVERRIDE",

  // 系统
  UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * 审计日志目标对象类型常量
 */
export const AuditTargetType = {
  USER: "USER",
  POST: "POST",
  COMMENT: "COMMENT",
  REPORT: "REPORT",
  CASE: "CASE",
  BOARD: "BOARD",
  INVITE_CODE: "INVITE_CODE",
  APPLICATION: "APPLICATION",
} as const;

export type AuditTargetTypeValue =
  (typeof AuditTargetType)[keyof typeof AuditTargetType];

/**
 * 记录审计日志（仅 INSERT，不可修改、不可删除）
 *
 * @param operatorId - 操作者用户 ID
 * @param action - 操作类型
 * @param targetType - 目标对象类型
 * @param targetId - 目标对象 ID
 * @param details - 操作详情（可选）
 * @param ipHash - IP 地址哈希（可选）
 * @returns 创建的审计日志记录
 *
 * Validates: Requirements 16.1, 16.2, 16.3
 */
export async function logAudit(
  operatorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Prisma.InputJsonValue,
  ipHash?: string
) {
  return prisma.auditLog.create({
    data: {
      operatorId,
      action,
      targetType,
      targetId,
      details: details ?? undefined,
      ipHash: ipHash ?? undefined,
    },
  });
}
