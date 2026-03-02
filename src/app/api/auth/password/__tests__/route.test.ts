import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the route
const mockGetToken = vi.fn();
const mockHash = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => mockHash(...args),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import { POST } from "../route";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== 未登录拒绝 ==========

  describe("未登录拒绝", () => {
    it("应在未登录时返回 401", async () => {
      mockGetToken.mockResolvedValue(null);

      const req = createRequest({ password: "securePass1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("未登录，请先登录");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("应在 token 无 id 时返回 401", async () => {
      mockGetToken.mockResolvedValue({ role: "USER" });

      const req = createRequest({ password: "securePass1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("未登录，请先登录");
    });
  });

  // ========== 输入验证失败 ==========

  describe("输入验证失败", () => {
    beforeEach(() => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
    });

    it("应拒绝过短的密码（< 8 字符）", async () => {
      const req = createRequest({ password: "short" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("应拒绝过长的密码（> 72 字符）", async () => {
      const req = createRequest({ password: "a".repeat(73) });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("应拒绝缺少 password 字段", async () => {
      const req = createRequest({});
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
    });
  });

  // ========== 已有密码拒绝 ==========

  describe("已有密码拒绝", () => {
    it("应在用户已有密码时返回 400", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockFindUnique.mockResolvedValue({ passwordHash: "$2b$10$existingHash" });

      const req = createRequest({ password: "newPassword1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("已设置密码，不可重复设置");
      expect(mockHash).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ========== 用户不存在 ==========

  describe("用户不存在", () => {
    it("应在用户不存在时返回 400", async () => {
      mockGetToken.mockResolvedValue({ id: "nonexistent-user" });
      mockFindUnique.mockResolvedValue(null);

      const req = createRequest({ password: "newPassword1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("用户不存在");
      expect(mockHash).not.toHaveBeenCalled();
    });
  });

  // ========== 成功设置密码 ==========

  describe("成功设置密码", () => {
    it("应成功设置密码并返回 success", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockFindUnique.mockResolvedValue({ passwordHash: null });
      mockHash.mockResolvedValue("$2b$10$hashedPassword");
      mockUpdate.mockResolvedValue({ id: "user-1" });

      const req = createRequest({ password: "securePass1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockHash).toHaveBeenCalledWith("securePass1", 10);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "$2b$10$hashedPassword" },
      });
    });

    it("应在 passwordHash 为空字符串时也允许设置", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      // passwordHash is empty string (falsy) — should allow setting
      mockFindUnique.mockResolvedValue({ passwordHash: "" });
      mockHash.mockResolvedValue("$2b$10$newHash");
      mockUpdate.mockResolvedValue({ id: "user-1" });

      const req = createRequest({ password: "validPass123" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });

  // ========== 服务器错误 ==========

  describe("服务器错误", () => {
    it("应在 prisma.user.findUnique 抛出异常时返回 500", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockFindUnique.mockRejectedValue(new Error("Database error"));

      const req = createRequest({ password: "securePass1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器错误，请稍后再试");
    });

    it("应在 prisma.user.update 抛出异常时返回 500", async () => {
      mockGetToken.mockResolvedValue({ id: "user-1" });
      mockFindUnique.mockResolvedValue({ passwordHash: null });
      mockHash.mockResolvedValue("$2b$10$hashedPassword");
      mockUpdate.mockRejectedValue(new Error("Database error"));

      const req = createRequest({ password: "securePass1" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("服务器错误，请稍后再试");
    });
  });
});
