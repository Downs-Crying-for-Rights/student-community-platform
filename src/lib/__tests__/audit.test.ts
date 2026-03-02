import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("../prisma", () => ({
  default: {
    auditLog: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { logAudit, AuditAction, AuditTargetType } from "../audit";

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({
    id: "audit-1",
    operatorId: "user-1",
    action: "ROLE_CHANGE",
    targetType: "USER",
    targetId: "user-2",
    details: null,
    ipHash: null,
    createdAt: new Date(),
  });
});

describe("审计日志模块", () => {
  describe("AuditAction 常量", () => {
    it("应包含所有需求 16.1 定义的敏感操作类型", () => {
      expect(AuditAction.ROLE_CHANGE).toBe("ROLE_CHANGE");
      expect(AuditAction.USER_BAN).toBe("USER_BAN");
      expect(AuditAction.USER_UNBAN).toBe("USER_UNBAN");
      expect(AuditAction.CONTENT_APPROVE).toBe("CONTENT_APPROVE");
      expect(AuditAction.CONTENT_REJECT).toBe("CONTENT_REJECT");
      expect(AuditAction.REPORT_RESOLVE).toBe("REPORT_RESOLVE");
      expect(AuditAction.REPORT_DISMISS).toBe("REPORT_DISMISS");
      expect(AuditAction.DCR_ACCESS_GRANT).toBe("DCR_ACCESS_GRANT");
      expect(AuditAction.CASE_EXPORT).toBe("CASE_EXPORT");
      expect(AuditAction.BOARD_PERMISSION_CHANGE).toBe("BOARD_PERMISSION_CHANGE");
      expect(AuditAction.UNAUTHORIZED_ACCESS).toBe("UNAUTHORIZED_ACCESS");
    });
  });

  describe("AuditTargetType 常量", () => {
    it("应包含所有目标对象类型", () => {
      expect(AuditTargetType.USER).toBe("USER");
      expect(AuditTargetType.POST).toBe("POST");
      expect(AuditTargetType.COMMENT).toBe("COMMENT");
      expect(AuditTargetType.REPORT).toBe("REPORT");
      expect(AuditTargetType.CASE).toBe("CASE");
      expect(AuditTargetType.BOARD).toBe("BOARD");
    });
  });

  describe("logAudit", () => {
    it("应使用所有必填字段创建审计日志记录", async () => {
      await logAudit("user-1", AuditAction.ROLE_CHANGE, AuditTargetType.USER, "user-2");

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          operatorId: "user-1",
          action: "ROLE_CHANGE",
          targetType: "USER",
          targetId: "user-2",
        },
      });
    });

    it("应支持传入 details 和 ipHash 可选参数", async () => {
      const details = { oldRole: "USER", newRole: "MODERATOR" };
      await logAudit(
        "admin-1",
        AuditAction.ROLE_CHANGE,
        AuditTargetType.USER,
        "user-2",
        details,
        "abc123hash"
      );

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          operatorId: "admin-1",
          action: "ROLE_CHANGE",
          targetType: "USER",
          targetId: "user-2",
          details: { oldRole: "USER", newRole: "MODERATOR" },
          ipHash: "abc123hash",
        },
      });
    });

    it("应在 details 为 undefined 时不传递该字段", async () => {
      await logAudit("user-1", AuditAction.USER_BAN, AuditTargetType.USER, "user-2", undefined, "hash123");

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          operatorId: "user-1",
          action: "USER_BAN",
          targetType: "USER",
          targetId: "user-2",
          ipHash: "hash123",
        },
      });
    });

    it("应返回创建的审计日志记录", async () => {
      const result = await logAudit("user-1", AuditAction.CONTENT_APPROVE, AuditTargetType.POST, "post-1");

      expect(result).toEqual(
        expect.objectContaining({
          id: "audit-1",
          operatorId: "user-1",
          action: "ROLE_CHANGE",
          targetType: "USER",
          targetId: "user-2",
        })
      );
    });

    it("应仅调用 prisma.auditLog.create（仅 INSERT 操作）", async () => {
      await logAudit("user-1", AuditAction.CASE_EXPORT, AuditTargetType.CASE, "case-1");

      // Verify only create was called — no update or delete
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("应支持记录举报处理操作", async () => {
      await logAudit(
        "mod-1",
        AuditAction.REPORT_RESOLVE,
        AuditTargetType.REPORT,
        "report-1",
        { resolution: "内容已删除" }
      );

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          operatorId: "mod-1",
          action: "REPORT_RESOLVE",
          targetType: "REPORT",
          targetId: "report-1",
          details: { resolution: "内容已删除" },
        },
      });
    });

    it("应支持记录未授权访问尝试", async () => {
      await logAudit(
        "user-1",
        AuditAction.UNAUTHORIZED_ACCESS,
        AuditTargetType.USER,
        "user-1",
        { path: "/admin/users" },
        "ip-hash-xyz"
      );

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          operatorId: "user-1",
          action: "UNAUTHORIZED_ACCESS",
          targetType: "USER",
          targetId: "user-1",
          details: { path: "/admin/users" },
          ipHash: "ip-hash-xyz",
        },
      });
    });
  });
});
