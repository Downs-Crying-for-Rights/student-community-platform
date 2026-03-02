import { describe, it, expect } from "vitest";
import {
  checkPermission,
  hasMinimumRole,
  ROLE_PERMISSIONS,
  type Action,
} from "../rbac";
import type { Role } from "@prisma/client";

describe("RBAC 权限系统", () => {
  describe("ROLE_PERMISSIONS 角色权限映射", () => {
    it("应为所有六个角色定义权限集合", () => {
      const roles: Role[] = [
        "USER",
        "TRUSTED_USER",
        "MODERATOR",
        "ADMIN",
        "DCR_HELPER",
        "SUPER_ADMIN",
      ];
      for (const role of roles) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
        expect(ROLE_PERMISSIONS[role].size).toBeGreaterThan(0);
      }
    });

    it("USER 应拥有基础读写权限", () => {
      const userPerms = ROLE_PERMISSIONS.USER;
      const expected: Action[] = [
        "read",
        "create_post",
        "edit_own_post",
        "delete_own_post",
        "create_comment",
        "edit_own_comment",
        "delete_own_comment",
        "like",
        "bookmark",
        "report",
      ];
      for (const action of expected) {
        expect(userPerms.has(action)).toBe(true);
      }
    });

    it("USER 不应拥有管理权限", () => {
      const userPerms = ROLE_PERMISSIONS.USER;
      expect(userPerms.has("access_psychology")).toBe(false);
      expect(userPerms.has("moderate_content")).toBe(false);
      expect(userPerms.has("manage_users")).toBe(false);
    });

    it("TRUSTED_USER 应继承 USER 权限并可访问心理区", () => {
      const trustedPerms = ROLE_PERMISSIONS.TRUSTED_USER;
      // Inherits all USER permissions
      for (const action of ROLE_PERMISSIONS.USER) {
        expect(trustedPerms.has(action)).toBe(true);
      }
      expect(trustedPerms.has("access_psychology")).toBe(true);
    });

    it("MODERATOR 应继承 TRUSTED_USER 权限并可审核内容", () => {
      const modPerms = ROLE_PERMISSIONS.MODERATOR;
      for (const action of ROLE_PERMISSIONS.TRUSTED_USER) {
        expect(modPerms.has(action)).toBe(true);
      }
      expect(modPerms.has("moderate_content")).toBe(true);
      expect(modPerms.has("manage_reports")).toBe(true);
      expect(modPerms.has("manage_tags")).toBe(true);
    });

    it("ADMIN 应继承 MODERATOR 权限并可管理用户和系统", () => {
      const adminPerms = ROLE_PERMISSIONS.ADMIN;
      for (const action of ROLE_PERMISSIONS.MODERATOR) {
        expect(adminPerms.has(action)).toBe(true);
      }
      expect(adminPerms.has("manage_users")).toBe(true);
      expect(adminPerms.has("manage_boards")).toBe(true);
      expect(adminPerms.has("manage_invites")).toBe(true);
      expect(adminPerms.has("view_audit_logs")).toBe(true);
      expect(adminPerms.has("manage_dcr_access")).toBe(true);
    });

    it("DCR_HELPER 应继承 TRUSTED_USER 权限并可处理 DCR 工单", () => {
      const dcrPerms = ROLE_PERMISSIONS.DCR_HELPER;
      for (const action of ROLE_PERMISSIONS.TRUSTED_USER) {
        expect(dcrPerms.has(action)).toBe(true);
      }
      expect(dcrPerms.has("handle_dcr_cases")).toBe(true);
    });

    it("DCR_HELPER 不应拥有审核或管理权限", () => {
      const dcrPerms = ROLE_PERMISSIONS.DCR_HELPER;
      expect(dcrPerms.has("moderate_content")).toBe(false);
      expect(dcrPerms.has("manage_users")).toBe(false);
      expect(dcrPerms.has("manage_boards")).toBe(false);
    });
  });

  describe("checkPermission 权限检查", () => {
    it("应允许 USER 执行基础操作", () => {
      expect(checkPermission("USER", "read")).toBe(true);
      expect(checkPermission("USER", "create_post")).toBe(true);
      expect(checkPermission("USER", "like")).toBe(true);
      expect(checkPermission("USER", "report")).toBe(true);
    });

    it("应拒绝 USER 执行管理操作", () => {
      expect(checkPermission("USER", "moderate_content")).toBe(false);
      expect(checkPermission("USER", "manage_users")).toBe(false);
      expect(checkPermission("USER", "access_psychology")).toBe(false);
    });

    it("应允许 ADMIN 执行所有操作", () => {
      const allActions: Action[] = [
        "read",
        "create_post",
        "moderate_content",
        "manage_users",
        "manage_boards",
        "manage_invites",
        "view_audit_logs",
        "manage_dcr_access",
      ];
      for (const action of allActions) {
        expect(checkPermission("ADMIN", action)).toBe(true);
      }
    });

    it("应允许传入 resource 参数而不影响结果", () => {
      expect(checkPermission("USER", "read", "post")).toBe(true);
      expect(checkPermission("USER", "manage_users", "user")).toBe(false);
    });
  });

  describe("hasMinimumRole 角色层级检查", () => {
    it("ADMIN 应满足所有角色要求", () => {
      expect(hasMinimumRole("ADMIN", "USER")).toBe(true);
      expect(hasMinimumRole("ADMIN", "TRUSTED_USER")).toBe(true);
      expect(hasMinimumRole("ADMIN", "MODERATOR")).toBe(true);
      expect(hasMinimumRole("ADMIN", "ADMIN")).toBe(true);
    });

    it("USER 应仅满足 USER 角色要求", () => {
      expect(hasMinimumRole("USER", "USER")).toBe(true);
      expect(hasMinimumRole("USER", "TRUSTED_USER")).toBe(false);
      expect(hasMinimumRole("USER", "MODERATOR")).toBe(false);
      expect(hasMinimumRole("USER", "ADMIN")).toBe(false);
    });

    it("MODERATOR 应满足 MODERATOR 及以下角色要求", () => {
      expect(hasMinimumRole("MODERATOR", "USER")).toBe(true);
      expect(hasMinimumRole("MODERATOR", "TRUSTED_USER")).toBe(true);
      expect(hasMinimumRole("MODERATOR", "MODERATOR")).toBe(true);
      expect(hasMinimumRole("MODERATOR", "ADMIN")).toBe(false);
    });

    it("DCR_HELPER 应与 TRUSTED_USER 同级", () => {
      expect(hasMinimumRole("DCR_HELPER", "USER")).toBe(true);
      expect(hasMinimumRole("DCR_HELPER", "TRUSTED_USER")).toBe(true);
      expect(hasMinimumRole("DCR_HELPER", "MODERATOR")).toBe(false);
    });
  });

  describe("SUPER_ADMIN 权限映射和层级检查", () => {
    it("SUPER_ADMIN 应拥有所有已定义的 Action", () => {
      const allActions: Action[] = [
        "read", "create_post", "edit_own_post", "delete_own_post",
        "create_comment", "edit_own_comment", "delete_own_comment",
        "like", "bookmark", "report", "access_psychology",
        "moderate_content", "manage_reports", "manage_tags",
        "manage_users", "manage_boards", "manage_invites",
        "view_audit_logs", "manage_dcr_access", "handle_dcr_cases",
      ];
      const superAdminPerms = ROLE_PERMISSIONS.SUPER_ADMIN;
      for (const action of allActions) {
        expect(superAdminPerms.has(action)).toBe(true);
      }
    });

    it("SUPER_ADMIN 应继承 ADMIN 的所有权限", () => {
      const adminPerms = ROLE_PERMISSIONS.ADMIN;
      const superAdminPerms = ROLE_PERMISSIONS.SUPER_ADMIN;
      for (const action of adminPerms) {
        expect(superAdminPerms.has(action)).toBe(true);
      }
    });

    it("SUPER_ADMIN 应拥有 handle_dcr_cases 权限", () => {
      expect(ROLE_PERMISSIONS.SUPER_ADMIN.has("handle_dcr_cases")).toBe(true);
    });

    it("SUPER_ADMIN 角色等级应为 4（最高）", () => {
      expect(hasMinimumRole("SUPER_ADMIN", "USER")).toBe(true);
      expect(hasMinimumRole("SUPER_ADMIN", "TRUSTED_USER")).toBe(true);
      expect(hasMinimumRole("SUPER_ADMIN", "DCR_HELPER")).toBe(true);
      expect(hasMinimumRole("SUPER_ADMIN", "MODERATOR")).toBe(true);
      expect(hasMinimumRole("SUPER_ADMIN", "ADMIN")).toBe(true);
      expect(hasMinimumRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    });

    it("非 SUPER_ADMIN 角色不应满足 SUPER_ADMIN 等级要求", () => {
      const otherRoles: Role[] = ["USER", "TRUSTED_USER", "DCR_HELPER", "MODERATOR", "ADMIN"];
      for (const role of otherRoles) {
        expect(hasMinimumRole(role, "SUPER_ADMIN")).toBe(false);
      }
    });

    it("checkPermission 对 SUPER_ADMIN 应对所有 Action 返回 true", () => {
      const allActions: Action[] = [
        "read", "create_post", "edit_own_post", "delete_own_post",
        "create_comment", "edit_own_comment", "delete_own_comment",
        "like", "bookmark", "report", "access_psychology",
        "moderate_content", "manage_reports", "manage_tags",
        "manage_users", "manage_boards", "manage_invites",
        "view_audit_logs", "manage_dcr_access", "handle_dcr_cases",
      ];
      for (const action of allActions) {
        expect(checkPermission("SUPER_ADMIN", action)).toBe(true);
      }
    });
  });
});
